"""
Fill the `type` column on the __review.csv via name-keyword heuristic,
then merge with __upload.csv into a single __final_upload.csv ready for
Bulk Upload.

Heuristic order matters — first match wins. Unmapped rows default to
the modal value ("Customs Broker"), so every row gets a value and
the validator passes. Misclassifications can be corrected post-import
via the Accounts list (Edit -> Type) or a re-upload with corrected CSV.

Run:
  python fill_types_and_merge.py "C:\\path\\to\\sample_customers 111__upload.csv"

(Just point at the upload file; the review/addresses files are picked
up alongside automatically.)
"""

import sys
import os
import re
import pandas as pd

# Ordered keyword -> type rules. First regex hit wins.
# Patterns are case-insensitive, applied to the `name` column.
TYPE_RULES = [
    (r"\bAIRLINE(S)?\b|\bAIRWAY(S)?\b|\bAVIATION\b",        "Airline"),
    (r"\bAIRPORT\b",                                          "Airport"),
    (r"\bEXPRESS\b",                                          "Express Company"),
    (r"\bGOVT|GOVERNMENT|MINISTRY|DEPARTMENT\b",              "Govt Department"),
    (r"\bHOSPITAL|MEDICAL\b",                                 "Hospital"),
    (r"\bLAND\s*PORT|ICD\b",                                  "Land Port"),
    (r"\bBONDED|TRUCK(ING)?\b",                               "Bonded Trucking"),
    (r"\bBROKER(AGE|S)?\b|\bCUSTOMS?\b",                      "Customs Broker"),
    (r"\bFREIGHT\b|\bCARGO\b|\bLOGISTIC(S)?\b|\bSHIPPING\b|\bFORWARDING\b",
                                                              "Freight Forwarder"),
    (r"\bTRANSPORT(ATION)?\b",                                "Bonded Trucking"),
]
DEFAULT_TYPE = "Customs Broker"


def classify(name: str) -> str:
    if not name:
        return DEFAULT_TYPE
    for pattern, t in TYPE_RULES:
        if re.search(pattern, name, re.IGNORECASE):
            return t
    return DEFAULT_TYPE


def main(upload_path: str):
    base = upload_path.replace("__upload.csv", "")
    review_path = base + "__review.csv"
    final_path = base + "__final_upload.csv"

    if not os.path.exists(upload_path):
        print(f"ERROR: file not found: {upload_path}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(review_path):
        print(f"ERROR: review file not found: {review_path}", file=sys.stderr)
        sys.exit(1)

    upload_df = pd.read_csv(upload_path, dtype=str).fillna("")
    review_df = pd.read_csv(review_path, dtype=str).fillna("")

    print(f"Upload (already typed):   {len(upload_df)} rows")
    print(f"Review (type blank):      {len(review_df)} rows")
    print()

    # Apply heuristic to review rows
    review_df["type"] = review_df["name"].apply(classify)

    # Distribution report
    counts = review_df["type"].value_counts()
    print(f"Auto-classified {len(review_df)} rows by company name:")
    for t, n in counts.items():
        marker = "  (default)" if t == DEFAULT_TYPE else ""
        print(f"  {t:25s} {n:5d}{marker}")
    print()

    # Merge — upload first, then auto-classified review rows
    merged = pd.concat([upload_df, review_df], ignore_index=True)
    merged.to_csv(final_path, index=False, encoding="utf-8-sig")

    print(f"Wrote: {final_path}")
    print(f"  {len(merged)} rows ready for Bulk Upload -> Customers")
    print()
    print("Spot-check before uploading:")
    print(merged.sample(min(8, len(merged)), random_state=42)[
        ["name", "type", "city", "erpAccountNo"]
    ].to_string(index=False, max_colwidth=50))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <path-to-customers__upload.csv>")
        sys.exit(1)
    main(sys.argv[1])
