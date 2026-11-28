import type { GuideSection } from './types';

/** Guide sections: payments, expenses, accounting, reports and WhatsApp. Text in Roman Urdu (owner's request). */
export const MONEY_SECTIONS: GuideSection[] = [
  {
    id: 'payments', part: 'money', title: 'Payments', icon: 'Banknote', path: '/payments', module: 'payments',
    summary: 'Payments page par saara paisa ek jagah hai: customers se wusooli, refund, suppliers ko payment aur staff ki salary.',
    blocks: [
      { type: 'options', title: 'Cards', items: [
        { name: 'Received today / Received this month', text: 'Aaj aur is mahine customers se kitna aaya (method ke hisaab se bhi).' },
        { name: 'Paid out this month', text: 'Suppliers, salary aur kharchon mein kitna gaya.' },
        { name: 'Net cash this month', text: 'Aaya minus gaya.' },
      ] },
      { type: 'steps', title: 'Customer se payment kaise lein', items: [
        '**Payments** kholein aur **Receive payment** dabaein.',
        'Order number, customer ka naam ya mobile likh kar order chunein (sirf baqi raqam wale order aate hain).',
        '**Amount (Rs)**, **Method** aur **Reference** (transaction ID ya cheque no.) likhein.',
        'Save dabaein aur **Print receipt** se receipt dein.',
      ] },
      { type: 'options', title: 'Tabs', items: [
        { name: 'Customer receipts', text: 'Har wusooli receipt number ke saath. Search, **Type** (Received / Refunds), method aur tareekh ke filter. Har row par print, WhatsApp aur **Reverse receipt**.' },
        { name: 'Refunds', text: 'Wo orders jin mein customer ne order ki qeemat se zyada diya (cancel ya kam hone ki wajah se). **Refund customer** dabaein, raqam, **Paid back by** aur **Reason** likh kar **Refund**.' },
        { name: 'Supplier payments', text: 'Suppliers ko di gayi saari payments.' },
        { name: 'Salary payments', text: 'Staff ko di gayi saari salaries.' },
      ] },
      { type: 'warning', text: 'Ghalat payment kabhi delete nahi hoti. **Reverse receipt** dabaein aur wajah likhein (jaise "Do dafa darj hui"). Reverse aur Refund ke liye Approve ki ijazat chahiye.' },
    ],
  },
  {
    id: 'expenses', part: 'money', title: 'Expenses', icon: 'Receipt', path: '/expenses', module: 'expenses',
    summary: 'Expenses mein dukaan ke chalne ke kharche hain: kiraya, bijli, gas, chai, transport waghera. Ye seedha Profit & Loss mein jate hain.',
    blocks: [
      { type: 'steps', title: 'Kharcha kaise darj karein', items: [
        '**Expenses** kholein aur **Add expense** dabaein.',
        '**Date**, **Category** (Shop Rent, Electricity, Gas, Water, Internet & Phone, Staff Food & Tea, Transport & Delivery, Repairs, Stationery, Tailoring Accessories, Marketing, Bank Charges, Generator Fuel, Cleaning & Security, Miscellaneous) chunein.',
        '**Description** (jaise "K-Electric bill November"), **Amount (Rs)**, **Paid by** (method), **Paid to** aur **Bill / reference no.** likhein.',
        'Save dabaein. Owner / Manager ka kharcha foran Approved hota hai; doosre staff ka "Pending approval" mein jata hai.',
      ] },
      { type: 'options', title: 'Options', items: [
        { name: 'Approve / Reject', text: 'Pending kharche ko manzoor ya radd karna (Approve ki ijazat chahiye).' },
        { name: 'Cancel', text: 'Approved kharcha cancel karna; wajah likhni hoti hai aur hisaab mein ulti entry lag jati hai (kuch delete nahi hota).' },
        { name: 'Print', text: 'Kharche ka A5 voucher, "Approved by" aur "Received by" ke dastakhat ke saath.' },
        { name: 'Filters', text: 'Search, Status (Pending approval, Approved, Rejected, Cancelled) aur Category.' },
        { name: 'Recurring tab', text: 'Har mahine / hafte / saal wale fixed kharche (kiraya, internet, chowkidar). Ek dafa **Add recurring** se banaein; waqt aane par **Create due expenses** dabaein to sab ban jate hain.' },
        { name: 'Categories tab', text: 'Nayi category **Add category**, aur har category kis account mein jaye.' },
        { name: 'Charts', text: 'Is mahine category ke hisaab se, aur pichle 6 mahine.' },
      ] },
    ],
  },
  {
    id: 'accounting', part: 'money', title: 'Accounting', icon: 'BookOpen', path: '/accounting', module: 'accounting',
    summary: 'Accounting mein dukaan ke poore khate khud bante hain (double entry). Har order, payment, purchase, salary aur kharcha khud hisaab mein chala jata hai, aap ko kuch likhna nahi parta.',
    blocks: [
      { type: 'options', title: 'Tabs', items: [
        { name: 'Overview', text: 'Cash, bank & wallet, customers ki taraf baqi, suppliers ko dena, kapre ke stock ki qeemat. **Post now** se foran hisaab update.' },
        { name: 'Profit & Loss', text: 'Sales, cost of sales, gross profit, salary, kharche aur net munafa.' },
        { name: 'Balance Sheet', text: 'Kisi tareekh par (**As on**) assets (jo aap ke paas hai), liabilities (jo dena hai) aur equity. Neeche "Balanced" likha ho to hisaab sahi hai.' },
        { name: 'Cash Flow', text: 'Cash, bank aur wallet mein kitna aaya, kitna gaya, aur aakhri balance.' },
        { name: 'Trial Balance', text: 'Har account ka debit / credit; dono barabar hon to "Balanced".' },
        { name: 'Journal', text: 'Har entry ki list (search aur source filter). Entry par click kar ke dekhein; ghalat manual entry ho to **Reverse**.' },
        { name: 'Chart of Accounts', text: '37 accounts (Cash in Hand, Bank, JazzCash / Easypaisa, Stitching Income, Shop Rent ...). **Add account** se naya. Account par click karein to us ka ledger (khata) khulta hai jo print bhi hota hai. Codes: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx expenses.' },
        { name: 'Month Closing', text: 'Mahina check kar ke **Close month** (koi purani tareekh mein entry na kar sake), zaroorat ho to **Reopen**, aur final hone par **Lock for ever** (kabhi nahi khulta, jaise tax filing ke baad).' },
      ] },
      { type: 'steps', title: 'Manual entry (New journal entry) kab aur kaise', items: [
        'Sirf un kaamon ke liye jo kisi aur page par nahi hote: owner ne paisa daala / nikala, cash bank mein jama karaya, qarz, machine khareedi, opening balance.',
        '**Journal** tab mein **New entry** dabaein.',
        '**Date** aur **Description** likhein (jaise "Cash Meezan Bank mein jama").',
        'Har line par account chunein aur Debit ya Credit likhein. Debit = paisa asset (cash / bank) mein aaya ya kharcha barha. Credit = paisa kahan se aaya (capital, aamdani, qarz).',
        'Misaal: owner Rs 50,000 cash laya: Debit 1000 Cash in Hand, Credit 3000 Owner\'s Capital.',
        'Dono taraf barabar hon to **Post entry** dabaein.',
      ] },
      { type: 'tip', text: 'Agar aap accounting nahi jaante to sirf Overview, Profit & Loss aur Cash Flow dekhein. Baqi kaam ERP khud karta hai.' },
    ],
  },
  {
    id: 'reports', part: 'reports', title: 'Reports', icon: 'BarChart3', path: '/reports', module: 'reports',
    summary: 'Reports mein 30 reports hain: sales, customers, kapra, staff, kharche aur accounts. Har report filter, Excel / PDF aur print ho sakti hai.',
    blocks: [
      { type: 'steps', title: 'Report kaise nikalein', items: [
        '**Reports** kholein. Reports groups mein hain (Sales & Orders, Customers, Inventory & Purchases, Staff & Payroll, Expenses, Accounts, System). Upar **Find a report** mein naam likh kar bhi dhoond sakte hain.',
        'Report par click karein.',
        '**Period** chunein (Today, This month, Custom waghera) ya statement ke liye **As on date**.',
        'Zaroorat ke filter lagaein (customer, employee, supplier, garment, status, method ...).',
        'Report neeche nazar aati hai: summary cards, table aur totals.',
      ] },
      { type: 'options', title: 'Report ke buttons', items: [
        { name: 'Search in report', text: 'Report ke andar naam, number ya lafz dhoondna.' },
        { name: 'Column header', text: 'Column ke naam par click se chhota se bara / bara se chhota.' },
        { name: 'Rows per page', text: '25, 50, 100 ya 250 rows ek safhe par.' },
        { name: 'Columns', text: 'Kaun se columns dikhane hain; **Default columns** se wapas asal. Ye is device par yaad rehta hai.' },
        { name: 'Saved filters', text: '**Save current filters** se filters ko naam de kar save karein (jaise "VIP customers is mahine") aur baad mein ek click mein kholein.' },
        { name: 'Export', text: '**Excel (.xlsx)**, **CSV (.csv)** ya **PDF (.pdf)** download.' },
        { name: 'Print', text: 'A4 par print (zyada columns hon to page leta hua).' },
        { name: 'Reset filters', text: 'Saare filter hatana.' },
      ] },
      { type: 'para', title: '30 reports', text: 'Daily Sales, Monthly Sales, Stitching Revenue, Fabric Sales, Order Register, Pending Orders, Delivered Orders, Delayed Orders, Customer Ledger, Customer Outstanding, Customer Payments, Fabric Stock, Stock Movements, Fabric Consumption, Supplier Ledger, Purchase Register, Employee Attendance, Employee Production, Employee Salary, Daily Wages, Advance Register, Overtime, Expense Register, Expense Summary, Profit & Loss, Cash Flow, Balance Sheet, Trial Balance, General Ledger, Audit Log.' },
      { type: 'tip', text: 'Jis report par taala (lock) ho wo aap ke role mein allowed nahi. Cancel orders aur radd kharche report mein grey nazar aate hain magar total mein nahi judte.' },
    ],
  },
  {
    id: 'whatsapp', part: 'reports', title: 'WhatsApp', icon: 'MessageCircle', path: '/whatsapp', module: 'whatsapp',
    summary: 'WhatsApp se customers ko order book, ready, deliver aur payment ke messages bhejein. Do tareeqe hain: Manual (baghair setup) aur Cloud API (automatic).',
    blocks: [
      { type: 'steps', title: 'Manual message (koi setup nahi chahiye)', items: [
        'Order, payment, customer profile ya print page par **Send WhatsApp** (ya WhatsApp) dabaein.',
        '**Message** mein template chunein (jaise order ready) ya **Type my own message** se apna likhein.',
        '**Mobile number** check karein aur **Preview** mein message dekh lein.',
        '**Open WhatsApp** dabaein. WhatsApp khulega message ke saath, wahan Send dabaein.',
      ] },
      { type: 'options', title: 'Tabs', items: [
        { name: 'Messages', text: 'Har message aur us ka status: Queued, Sent, Delivered, Read, Failed. Search, Status aur Channel (Cloud API / Manual) filter. Fail message par **Send again** ya **Cancel message**. **New message** se kisi bhi customer ko message, **Send queued now** se intezar wale foran.' },
        { name: 'Templates', text: 'Messages ke tayyar namoone. **Add template**: **Template name (as in Meta)**, **Used for**, **Language code**, **Meta category**, **Message text**. Cloud API ke liye naam aur text bilkul Meta mein approved jaisa ho. **Check status in Meta** se approval dekhein.' },
        { name: 'Settings', text: '**Send through the Cloud API** on karein aur Meta se **Phone number ID**, **WhatsApp Business Account ID**, **Permanent access token**, **App secret** daalein; **Test connection** dabaein. **Webhook** ke Callback URL aur Verify token Meta mein paste karein. **Automatic messages** mein chunein kis waqt khud message jaye (order book, ready, deliver, payment).' },
      ] },
      { type: 'tip', text: 'Automatic message sirf un customers ko jata hai jinhon ne ijazat di (customer profile mein WhatsApp tick). Customer STOP likh de to messages band, START likhe to dobara shuru. Cloud API ki poori setup guide docs/WHATSAPP-SETUP.md mein hai.' },
    ],
  },
];
