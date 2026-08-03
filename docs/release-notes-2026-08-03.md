# SmartCRM — What's New (28 Jul – 3 Aug 2026)

A quick tour of everything that changed this week. All features are live at
https://smartcrm-hans.vercel.app — just refresh your browser (Ctrl+Shift+R).

---

## 🎯 Lead Assignment — new page + full tracking
- **New page: Analytics → Lead Assignment** (managers & admins) — see who holds
  which leads, by stage, with KPIs, a per-owner chart, and filters
  (Product / Region / Owner / Date).
- **From → To matrix** — a grid showing who assigned how many leads to whom.
  **Click any number** to see the exact leads behind it.
- **Reassign right from the page** — expand an owner, pick a new one, add an
  optional handoff note.
- **Every assignment is tracked**: who assigned, to whom, when, with the note —
  visible in the lead's timeline and in new **Assigned By / Assigned Date**
  columns on the Leads table.
- **You keep sight of leads you hand off**: after assigning a lead to a
  colleague you can still follow its progress (and the deal it becomes).
  Use the purple **"assigned by me"** chip on the Leads page.
- **Historic leads**: admins can backfill who assigned older leads (bulk
  "Set assigner" on Leads, or per-lead in the matrix).

## 🔔 Notifications — now on every device
- The **bell** now works across devices. When a lead is assigned to you, you
  get a bell notification **and** a follow-up task in Activities.
- The person who assigned the lead is notified when it **converts to a deal**
  and again when the **deal is WON** — incentive checkpoints.

## 📇 Leads page
- New **Opp Stage** column: for converted leads, see the live stage of the
  deal they became (Won green / Lost red / in-progress blue) — plus an
  **Opp Stage filter** and sortable header.
- The assigned salesperson is now consistently labelled **Owner**.
- Converted leads no longer count as "overdue follow-ups".

## 📈 Pipeline
- **Filter Stage = Won** and the KPI cards switch to sales metrics:
  **Sales Won · New Customers · Cross-sell Sales · Revenue Closed · Avg Days
  to Close**. Combine with the Owner filter for per-rep sales stats.
- **Sorting fixed**: value columns now sort by amount (₹80L > ₹50L > ₹8L) —
  previously they sorted digit-by-digit. Applies to Leads, Accounts,
  Contacts and Pipeline tables.
- Reminder: a deal needs a **linked account** before it can close as Won
  (Finance invoices against the account) — the app tells you how to link one.

## 📅 Calendar
- **Scheduled calls now show in magenta**, clearly separate from logged calls
  (green), activities (purple) and events (blue) — with a legend on the page
  and a new **"Scheduled Calls only"** filter.
- **Mark Complete now asks for the outcome**: pick the result (Completed /
  No Answer / Rescheduled / Voicemail / Left Message), add remarks, and
  optionally **schedule the next call in the same dialog**.

## 🤖 AI (admin-enabled)
- **Analyze Email (AI)** on Communications: paste a customer email or thread —
  the AI extracts a summary, intent (RFQ / complaint / shipment update…),
  action items, commitments, dates, shipment references (HAWB/MAWB/BL/
  Container/Job No…), priority and sentiment — then saves it to the timeline
  and can create the follow-up task.

## 🔐 Sign-in & housekeeping
- **"Remember me on this device"** on the login page — your email is
  pre-filled next time, and the browser can save your password securely.
- Fixed: the **profile password fields** wouldn't accept typing.
- **Team & Users** (roles, credentials, permissions) is now visible to
  Admin / MD / VP only.
- The "dormant accounts" pop-up now appears at most **once per day** instead
  of on every refresh.
- Closing a deal now shows one clear next step: **get Finance approval with
  the account-creation documents**.

## 🛠 Reliability
- Fixed a sync issue where a lead **reassigned to someone outside your team**
  never reached other users' screens.
- Fixed cases where sales reps saw repeated *"changes could NOT be saved"*
  errors — the app no longer attempts writes it isn't allowed to make.

---
*Questions or issues? Message the admin team.*
