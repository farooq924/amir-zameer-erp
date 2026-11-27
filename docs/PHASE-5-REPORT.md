# Phase 5 - Employees, Attendance, Production & Payroll: Completion Report (2026-11-27)

Version: **1.5.0** (bottom of the side menu; click it for release notes).

## Implemented
* **Employees** (`/employees`): codes `AZE-0001`, name, father's name, mobile, CNIC (unique, `35202-1234567-1`), address, work type
  (tailor, master tailor, cutter, helper, finishing, sales, other), designation, employment type, joining date, bank details, notes.
  Cards: current staff, present today, monthly salaries, advances to recover. Search by name, code, mobile or CNIC; filters for status and work type.
* **Employee page** (`/employees/:id`): salary, this month's attendance, advance balance, unpaid piece work; tabs Salary (history), Advances,
  Payslips, Work, Leave & overtime, Details (with job history). Buttons: Call, Give advance, Change salary, Status, Edit, Delete.
* **Salary types**: Monthly, Daily wage, Per piece, Fixed + per piece; overtime rate per hour. **Change salary** adds a new row from a date and
  closes the old one, so earlier months are always paid at the old salary.
* **Status**: Active, On leave, Inactive, Left the job (with last working day; paid only up to that day). Employees with records cannot be deleted.
* **Attendance** (`/attendance`):
  * *Daily*: one tap per employee (Present / Absent / Half day / Leave / Holiday), "Mark rest present", optional in / out times, unsaved-changes bar.
  * *Monthly register*: grid of every day with P / A / H / L / O and totals; printable.
  * *Leave*: casual, sick, annual, unpaid, other; overlap check; approval marks the days in attendance (unpaid leave = absent, so it is deducted).
  * *Overtime*: hours x rate (default from salary), needs approval before it is paid.
* **Production** (`/production`): record pieces finished by an employee against an order garment (cutting, stitching, finishing, alteration,
  embroidery, pressing). Rate = garment piece rate (Garments page), else the employee's per-piece rate, or typed. Cannot record more pieces than
  the garment has for the same work. Unpaid records can be removed.
* **Advances**: `ADV-YYYY-00001`, amount, cut per salary (instalment), method, reason; saved once even if pressed twice; write-off needs approval.
* **Payroll** (`/payroll`): one run per month `PAY-YYYY-MM`.
  * *Calculate* (draft): Monthly = salary (pro-rated for joiners / leavers) minus absent days (salary / days in month x (absent + half of half days));
    unmarked days are not deducted. Daily = wage x (present + half of half days). Per piece = unpaid production. Fixed + per piece = both.
    Plus approved overtime; minus advance instalments (never more than the salary left).
  * *Adjust*: bonus, incentive, other deduction, advance cut and a note per employee. *Recalculate* re-reads all records (keeps bonus etc.).
  * *Approve*: checks the figures still match the records, links production and overtime as paid, recovers advances, and **locks the month**
    (attendance, overtime and production of that month cannot change). *Reopen* undoes all of it, only before any salary is paid.
  * *Pay*: per employee (full or part) or *Pay all*, `SAL-YYYY-00001`; saved once even if pressed twice; status Partly paid / Paid.
  * *Payslips*: A4 salary slip per employee or all at once, with earnings, deductions, net, payments, advance balance, piece work and the
    Brandistan developer footer.
* **Permissions**: Employees, Attendance, Production and Payroll modules (already in Roles). Tailors can view production; receptionists have no HR access.

## Database
No table changes (all tables were created in Phase 1). New migration `20261127140000_payroll_rules` only adds safety rules, safe on live data:
salary payments and employment history cannot be edited or deleted; a payroll line with payments cannot be deleted; non-negative checks
(added `NOT VALID`, so existing rows are not re-checked).

## Tests
* Backend: 17 suites, **143 tests** passed (new: 8 payroll-maths unit tests, 15 employees / attendance / production / payroll e2e tests).
* Frontend unit: 5 files, 17 tests passed. Playwright: new `e2e/employees.spec.ts` (add employee with salary, advance, attendance) passed.
* Type check and production build clean. Manual check at 1366 px and 390 px with demo data: all new pages and dialogs, no horizontal scroll.
