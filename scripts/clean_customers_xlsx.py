"""
Clean a customers master spreadsheet for SmartCRM bulk upload.

What it does:
  1. Drops unnamed/junk columns Excel sometimes appends.
  2. Strips placeholder values ("0", ".", "nan") from columns where they
     pose as data — primaryEmail / primaryContact / primaryPhone /
     city / state / pincode. Replaces them with blanks so they don't
     pollute Supabase.
  3. Deduplicates on `accountNo`. For multi-branch entities (AIR INDIA
     etc.) keeps ONE row per accountNo (the "Head Office") and routes
     the other rows to a separate addresses CSV. The Head Office row
     is picked as the row with the most non-blank fields, on the
     theory that the master record is more complete than branch ones.
  4. Splits the deduped Head Office set into:
       - customers_upload.csv   — type field is set, ready for import
       - customers_review.csv   — type field is blank, needs manual fill
                                   (the bulk-upload validator will block
                                   these otherwise)
  5. Writes the dropped branch rows to:
       - customers_addresses.csv — for a follow-up Addresses CSV upload
                                   once the parent accounts exist

Run:
  python clean_customers_xlsx.py "C:\\path\\to\\sample_customers 111.xlsx"

Outputs are written next to the input file. Idempotent — re-running
overwrites the outputs in place.
"""

import sys
import os
import pandas as pd

# Cells with these literal string values are treated as blank for the
# columns listed below. Limited scope so we don't accidentally wipe
# legitimate "0" values from numeric-looking fields.
PLACEHOLDER_VALUES = {"0", ".", "nan", "NaN", "None"}
PLACEHOLDER_TARGET_COLS = [
    "primaryEmail", "primaryContact", "primaryPhone",
    "city", "state", "pincode",
]


def clean_placeholders(df: pd.DataFrame) -> pd.DataFrame:
    """Replace placeholder strings with NaN in target columns only."""
    for col in PLACEHOLDER_TARGET_COLS:
        if col in df.columns:
            mask = df[col].astype(str).str.strip().isin(PLACEHOLDER_VALUES)
            df.loc[mask, col] = ""
    # Also strip "nan" globally — it appears as literal text in many cells
    # from a prior export-with-NumPy-NaN-not-coerced bug. Safe everywhere
    # because no real customer field stores the literal string "nan".
    df = df.replace({"nan": "", "NaN": ""})
    return df


def pick_head_office(group: pd.DataFrame) -> pd.Series:
    """Pick the row with the most non-blank cells as the Head Office."""
    if len(group) == 1:
        return group.iloc[0]
    # Score = count of cells that are not blank/null
    def filled_count(row):
        return sum(
            1 for v in row
            if pd.notna(v) and str(v).strip() not in {"", "0", ".", "nan", "NaN"}
        )
    scores = group.apply(filled_count, axis=1)
    return group.loc[scores.idxmax()]


def main(input_path: str):
    if not os.path.exists(input_path):
        print(f"ERROR: file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    out_dir = os.path.dirname(input_path) or "."
    base = os.path.splitext(os.path.basename(input_path))[0]

    print(f"Reading {input_path}…")
    df = pd.read_excel(input_path, dtype=str)

    # 1. Drop unnamed columns
    unnamed_cols = [c for c in df.columns if str(c).startswith("Unnamed")]
    if unnamed_cols:
        df = df.drop(columns=unnamed_cols)
        print(f"  Dropped {len(unnamed_cols)} unnamed columns")

    # 1b. Move ERP-issued accountNo (SHP/CTM codes from Hans's ERP) into
    #     a separate erpAccountNo column. accountNo is left blank so the
    #     CRM auto-generates ACC-YYYY-NNN on import. Both codes are
    #     persisted on the account row (db migration add_erp_account_no_v1.sql)
    #     so cross-system mapping survives.
    if "accountNo" in df.columns and "erpAccountNo" not in df.columns:
        df = df.rename(columns={"accountNo": "erpAccountNo"})
        df["accountNo"] = ""
        print(f"  Remapped accountNo -> erpAccountNo (CRM will auto-generate fresh accountNo)")

    # Coerce all to string for consistent handling
    df = df.fillna("")
    for c in df.columns:
        df[c] = df[c].astype(str)

    initial_rows = len(df)
    print(f"  Loaded {initial_rows} rows × {len(df.columns)} columns")

    # 2. Clean placeholder values
    df = clean_placeholders(df)
    print(f"  Cleaned placeholder values in {len(PLACEHOLDER_TARGET_COLS)} columns")

    # 3. Deduplicate by ERP code (since the source ERP system's identity
    #    is the dedup key — multiple rows in the source file with the same
    #    SHP/2881 are different branches of the same parent entity).
    dedup_key = "erpAccountNo" if "erpAccountNo" in df.columns else "accountNo"
    if dedup_key not in df.columns:
        print(f"ERROR: '{dedup_key}' column missing — cannot dedupe", file=sys.stderr)
        sys.exit(2)

    has_acc = df[dedup_key].astype(str).str.strip() != ""
    no_acc = df[~has_acc].copy()
    with_acc = df[has_acc].copy()

    head_office_rows = []
    branch_rows = []
    for acc_no, grp in with_acc.groupby(dedup_key):
        if len(grp) == 1:
            head_office_rows.append(grp.iloc[0])
            continue
        head = pick_head_office(grp)
        head_office_rows.append(head)
        # Remaining rows are branches — keep accountNo so they can be
        # re-linked when uploaded as addresses later.
        branches = grp.drop(index=head.name)
        branch_rows.append(branches)

    head_office_df = pd.DataFrame(head_office_rows).reset_index(drop=True)
    branches_df = (
        pd.concat(branch_rows, ignore_index=True)
        if branch_rows else pd.DataFrame(columns=df.columns)
    )

    # Rows with no accountNo — keep as-is, append to head_office set.
    # They'll get auto-generated accountNo on import (ACC-YYYY-NNN).
    head_office_df = pd.concat([head_office_df, no_acc], ignore_index=True)

    print(f"  Total unique accountNos: {len(with_acc['accountNo'].unique())}")
    print(f"  + {len(no_acc)} rows with no accountNo")
    print(f"  -> Head Office rows: {len(head_office_df)}")
    print(f"  -> Branch rows (separate file): {len(branches_df)}")

    # 4. Split Head Office set on `type` field validity
    valid_types = {
        "Freight Forwarder", "Customs Broker", "Airline", "Express Company",
        "Bonded Trucking", "Land Port", "Airport", "Govt Department",
        "Partner", "Hospital",
    }
    type_col = head_office_df["type"].astype(str).str.strip()
    type_ok = type_col.isin(valid_types)

    upload_df = head_office_df[type_ok].copy()
    review_df = head_office_df[~type_ok].copy()

    print(f"  -> Ready to upload (type set): {len(upload_df)}")
    print(f"  -> Need review (type blank/invalid): {len(review_df)}")

    # 5. Write outputs
    upload_path = os.path.join(out_dir, f"{base}__upload.csv")
    review_path = os.path.join(out_dir, f"{base}__review.csv")
    addr_path = os.path.join(out_dir, f"{base}__addresses.csv")

    upload_df.to_csv(upload_path, index=False, encoding="utf-8-sig")
    review_df.to_csv(review_path, index=False, encoding="utf-8-sig")
    branches_df.to_csv(addr_path, index=False, encoding="utf-8-sig")

    print()
    print("Wrote:")
    print(f"  {upload_path}  ({len(upload_df)} rows — bulk-upload now)")
    print(f"  {review_path}  ({len(review_df)} rows — fill 'type' then upload)")
    print(f"  {addr_path}    ({len(branches_df)} rows — upload as addresses later)")
    print()
    print("Next steps:")
    print("  1. Open the __review file. Fill the `type` column for each row.")
    print("     Allowed values: " + ", ".join(sorted(valid_types)))
    print("  2. Move review rows back into __upload (or upload separately).")
    print("  3. Bulk Upload -> Customers -> drop the __upload CSV -> Validate -> Apply.")
    print("  4. Once parent accounts exist, upload __addresses as a Contacts/")
    print("     Addresses follow-up so each branch becomes an address entry on")
    print("     the parent account.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <path-to-customers.xlsx>")
        sys.exit(1)
    main(sys.argv[1])
