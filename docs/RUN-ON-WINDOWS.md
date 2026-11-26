# Run AMIR ZAMEER ERP on Windows (local testing)

## 1. Install once
| Software | Where | Note |
|---|---|---|
| Node.js 22 LTS | https://nodejs.org | Default options |
| PostgreSQL 16 | https://www.postgresql.org/download/windows/ | Remember the password you set for user `postgres`. Port 5432. |
| Git | https://git-scm.com/download/win | Default options |

Then open **PowerShell** and run:
```powershell
npm install -g pnpm@10.28.0
```

## 2. Get the code
```powershell
cd D:\Claude-AI
git clone https://github.com/farooq924/amir-zameer-erp.git
cd amir-zameer-erp
```
(Or unzip `amir-zameer-erp-phase1.zip` into `D:\Claude-AI\amir-zameer-erp`.)

## 3. Create the database
```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE USER az_erp WITH PASSWORD 'az_erp_dev' CREATEDB;"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE amir_zameer_erp OWNER az_erp;"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE amir_zameer_erp_test OWNER az_erp;"
```
It asks for the `postgres` password each time.

## 4. Settings file
```powershell
Copy-Item .env.example apps\backend\.env
notepad apps\backend\.env
```
Change these lines and save:
```
DATABASE_URL=postgresql://az_erp:az_erp_dev@localhost:5432/amir_zameer_erp?schema=public&connection_limit=10
OWNER_PASSWORD=<your strong password, min 10 chars, upper + lower case + number>
```

## 5. Install and prepare (first time only)
```powershell
pnpm install
pnpm --filter @az/shared build
pnpm --filter @az/backend db:migrate
pnpm --filter @az/backend db:seed
```

## 6. Start (every time)
PowerShell window 1:
```powershell
cd D:\Claude-AI\amir-zameer-erp
pnpm dev:backend
```
PowerShell window 2:
```powershell
cd D:\Claude-AI\amir-zameer-erp
pnpm dev:frontend
```
Open **http://localhost:5173** and log in with username `owner` and your `OWNER_PASSWORD`.
API documentation: http://localhost:4000/api/docs - health check: http://localhost:4000/api/health

## 7. Automated checks (optional)
```powershell
pnpm -r typecheck
pnpm --filter @az/backend test
pnpm --filter @az/frontend test
```
The backend tests use the `amir_zameer_erp_test` database with user `az_erp` / password `az_erp_dev` (step 3).

## Problems
| Message | Fix |
|---|---|
| `P1001 Can't reach database` | PostgreSQL service is not running: Windows Start > Services > postgresql-x64-16 > Start |
| `password authentication failed` | Check user/password in `DATABASE_URL` |
| Port 4000 or 5173 already in use | Close the other PowerShell window running the app |
| `OWNER_EMAIL and OWNER_PASSWORD must be set` | Fill them in `apps\backend\.env`, run the seed again |
