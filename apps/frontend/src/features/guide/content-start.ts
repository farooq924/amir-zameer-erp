import type { GuideSection } from './types';

/** Guide sections: getting started, settings and access. Text in Roman Urdu (owner's request). */
export const START_SECTIONS: GuideSection[] = [
  {
    id: 'welcome', part: 'start', title: 'Welcome to TailoringERP', icon: 'BookOpen',
    summary: 'TailoringERP (By Brandistan) aap ki tailoring shop ka poora hisaab ek jagah rakhta hai: customers, naap (measurements), orders, kapra (fabric), staff ki salary, kharche aur accounts. Is guide mein har page aur har button ko aasan alfaaz mein samjhaya gaya hai.',
    blocks: [
      { type: 'para', title: 'Is guide ko kaise parhein', text: 'Baen (left) taraf sections ki list hai. Upar se neeche tak tarteeb se parhein: pehle Login aur First Time Setup, phir rozana ka kaam (Customers, Orders), phir Staff, Paisa, Reports aur aakhir mein Backup. Har section mein **Open page** button hai jo seedha us page par le jata hai. Upar **Search the guide** box mein koi bhi lafz likhein (jaise "advance" ya "backup") to sirf wohi sections nazar aayenge.' },
      { type: 'options', title: 'Screen ka naqsha (Computer par)', items: [
        { name: 'Side menu (navy rang)', text: 'Baen taraf ka neela menu. Har module (Dashboard, Customers, Orders ...) yahan hai. Sirf wohi menu nazar aate hain jin ki aap ke role ko ijazat hai.' },
        { name: 'Collapse', text: 'Side menu ke neeche ka button. Menu ko patla kar deta hai taake page ko zyada jagah mile. Dobara dabane se menu khul jata hai.' },
        { name: 'App version (v2.x.x)', text: 'Side menu ke bilkul neeche ERP ka version likha hota hai. Is par click karein to "About" khulta hai jahan har update mein kya naya aaya, wo likha hai.' },
        { name: 'Search box (Ctrl + K)', text: 'Upar wali patti mein customer dhoondne ka box. Naam, customer code ya mobile number likhein aur Enter dabaein. Keyboard par **Ctrl + K** dabane se bhi ye box khul jata hai.' },
        { name: 'Account menu (aap ka naam)', text: 'Upar daen (right) kone mein aap ka naam. Is mein **Change Password**, **My Devices**, **Dark Mode** aur **Logout** hain.' },
        { name: 'Online / Offline pill', text: 'Upar patti mein chhota sa nishan jo batata hai ke internet chal raha hai ya nahi, aur kitni entries sync hone ka intezar kar rahi hain.' },
      ] },
      { type: 'options', title: 'Screen ka naqsha (Mobile par)', items: [
        { name: 'Upar navy patti', text: 'Is mein menu ka button (teen lakeerein) hai. Dabane se poora menu side se khulta hai, neeche Logout aur version bhi hai.' },
        { name: 'Neeche wali patti', text: '**Home** (Dashboard), **Orders**, beech mein sunehra **+** (Quick add), **Customers** aur **More** (poora menu).' },
        { name: 'Quick add (+)', text: 'Aam kaam ek tap mein: **Add Customer**, **Find Customer**, **Measurements**, **New Order** aur **Offline Desk**.' },
      ] },
      { type: 'tip', text: 'Har list mein upar search aur filters hote hain, neeche **Previous / Next** se agla safha (page) khulta hai. Computer par list table ki shakal mein, aur mobile par cards ki shakal mein nazar aati hai.' },
      { type: 'tip', text: 'Rang ka matlab: hara (green) = theek / mukammal, peela (amber) = kaam jaari / intezar, laal (red) = baqi / der / blocked, neela (blue) = ready, grey = cancel ya band.' },
    ],
  },
  {
    id: 'login', part: 'start', title: 'Login & Your Account', icon: 'Lock', path: '/login',
    summary: 'ERP kholne ke liye username aur password chahiye. Yahan login, password badalna, logout aur apne devices dekhna samjhaya gaya hai.',
    blocks: [
      { type: 'steps', title: 'Login kaise karein', items: [
        'Browser (Chrome ya Edge) mein ERP ka address kholein, jaise https://tailoringerp.brandistan.pk ya dukaan ke computer par http://localhost:4000.',
        '**Username or email** ke khane mein apna username ya email likhein.',
        '**Password** ke khane mein password likhein.',
        '**Sign in** dabaein. Dashboard khul jayega.',
      ] },
      { type: 'warning', text: 'Ghalat password 5 dafa dalne par account 15 minute ke liye lock ho jata hai. Owner ya Administrator **Security** page ke **Locked accounts** tab se foran unlock kar sakta hai.' },
      { type: 'steps', title: 'Password kaise badlein', items: [
        'Upar daen kone mein apne naam par click karein (mobile par menu kholein).',
        '**Change Password** dabaein.',
        '**Current password** mein purana password likhein.',
        '**New password** aur **Confirm new password** mein naya password do dafa likhein. Kam az kam 10 harf, ek bara harf (A), ek chhota harf (a) aur ek number (1) zaroori hai.',
        '**Update password** dabaein. Aap ke baqi devices se login khud khatam ho jayega, sirf ye device chalta rahega.',
      ] },
      { type: 'options', title: 'Account menu ke options', items: [
        { name: 'Change Password', text: 'Apna password badalna (upar tareeqa dekhein).' },
        { name: 'My Devices', text: 'Jin phones / computers par aap ka login khula hai unki list. Koi purana ya anjaan device nazar aaye to wahan se **Sign out** kar dein.' },
        { name: 'Dark Mode', text: 'Screen ko gehra (raat wala) rang de deta hai. Ye har device par alag yaad rehta hai.' },
        { name: 'Logout', text: 'ERP se bahar nikalna. Agar offline kaam abhi server tak nahi pohncha to ERP pehle khabardar karega; tab **Sync Center** se sync kar ke phir logout karein.' },
      ] },
      { type: 'tip', text: 'Login khud bhi kuch der baad khatam ho jata hai (lagbhag 2 ghante koi kaam na ho, ya 12 ghante baad). Dobara Sign in kar lein, koi data zaya nahi hota.' },
    ],
  },
  {
    id: 'first-setup', part: 'start', title: 'First Time Setup (Step by Step)', icon: 'ListChecks',
    summary: 'ERP chalane se pehle ek dafa ye kaam tarteeb se kar lein. Phir rozana ka kaam bilkul aasan ho jayega.',
    blocks: [
      { type: 'steps', title: 'Tarteeb se ye kaam karein', items: [
        '**Settings > Business Profile**: dukaan ka naam, phone, WhatsApp, address aur NTN likh kar **Save** karein. Ye har receipt aur invoice par chhapta hai.',
        '**Settings > Printing**: receipt printer 58 mm hai ya 80 mm, wo chunein. A4 invoice ka title aur terms likhein.',
        '**Settings > Users**: har staff member ka alag login banaein (kabhi ek hi login sab ko na dein).',
        '**Settings > Roles & Permissions**: dekh lein ke har role (Cashier, Tailor, Receptionist ...) kya kya kar sakta hai.',
        '**Garments**: har garment (Shalwar Kameez, Waistcoat ...) ki silai ki qeemat, fi piece kapra aur tailor ki fi piece mazdoori likhein. Shuru mein sab qeematein 0 hoti hain.',
        '**Measurements > Templates**: naap ke forms dekh lein; agar koi naya naap chahiye (jaise Sherwani) to template bana lein.',
        '**Suppliers**: jin se kapra khareedte hain un ko add karein, purana udhaar ho to **Opening balance** mein likhein.',
        '**Fabric Inventory**: kapre ki categories aur dukaan ka maujooda kapra (opening stock) add karein.',
        '**Employees**: har karigar / staff ko add karein aur un ki salary set karein.',
        '**Expenses > Categories** aur **Recurring**: kiraya, bijli jaise fixed kharche ek dafa bana lein.',
        '**WhatsApp > Settings**: agar automatic messages chahiye to Cloud API set karein (warna manual WhatsApp baghair setup ke chalta hai).',
        '**Backup**: **Download recovery key** dabaein aur key USB mein sambhal lein; **Second copy folder** set karein; ek dafa **Back up now** dabaein.',
      ] },
      { type: 'tip', text: 'ERP seekhne ke liye Demo data load kiya ja sakta hai (login: demo). Asal kaam shuru karne se pehle demo data hata dein taake hisaab mein na mile.' },
    ],
  },
  {
    id: 'dashboard', part: 'start', title: 'Dashboard', icon: 'LayoutDashboard', path: '/', module: 'dashboard',
    summary: 'Dashboard ERP ka pehla page hai. Is par ek nazar mein pata chalta hai ke kitni sale hui, kitne order baqi hain, kitna paisa aaya aur kitna kharcha hua.',
    blocks: [
      { type: 'options', title: 'Date range (upar)', items: [
        { name: 'Date range', text: 'Upar se waqt chunein: Today, Yesterday, This week, This month, Last month, This year waghera, ya **Custom** se apni marzi ki tareekhein (From date / To date). Saare cards aur charts usi waqt ke hisaab se badal jate hain.' },
      ] },
      { type: 'options', title: 'Cards ka matlab', items: [
        { name: 'Total Sales', text: 'Chune gaye waqt mein book hone wale orders ki kul qeemat.' },
        { name: 'Stitching Revenue / Fabric Sales', text: 'Silai se kitni kamai hui aur kapra bechne se kitni.' },
        { name: 'Total Orders', text: 'Kitne order book hue.' },
        { name: 'Net Profit', text: 'Aamdani mein se kapre ki laagat, salary aur approved kharche nikal kar asal munafa.' },
        { name: 'Cash Received', text: 'Customers se kitna paisa wusool hua.' },
        { name: 'Expenses', text: 'Approved kharche.' },
        { name: 'Pending Orders / Ready Orders', text: 'Kitne order abhi ban rahe hain aur kitne tayyar hain (customer ko dene hain).' },
        { name: 'Outstanding', text: 'Customers ki taraf kul baqi raqam.' },
        { name: 'Fabric Stock', text: 'Dukaan mein kapre ki maujooda qeemat. Click karne par Fabric Inventory khulta hai.' },
      ] },
      { type: 'options', title: 'Quick Actions', items: [
        { name: 'New Order / Add Customer / Measurements', text: 'Seedha naya order, naya customer ya naap ka page kholte hain.' },
        { name: 'Receive Fabric', text: 'Supplier se aaya kapra (nayi purchase) darj karne ka form.' },
        { name: 'Production / Receive Payment', text: 'Karigar ka mukammal kaam darj karna, ya customer se paisa wusool karna.' },
      ] },
      { type: 'para', title: 'Charts', text: 'Sales & Revenue Trend (12 mahine), Orders by Status, Daily Sales, Stitching vs Fabric Sales, Monthly Expenses, Profit Trend aur Employee Production (sab se zyada piece banane wale 10 karigar). Kisi chart par mouse rakhein to us din / mahine ki raqam nazar aati hai.' },
      { type: 'tip', text: 'Dashboard par saare numbers asal records se aate hain. Agar koi card 0 dikha raha hai to us waqt mein us kaam ka koi record nahi hai.' },
    ],
  },
  {
    id: 'settings', part: 'setup', title: 'Settings', icon: 'Settings', path: '/settings', module: 'settings',
    summary: 'Settings mein dukaan ki maloomat, numbering, order ke default aur printing ke options hain. Har hissa alag card mein hai aur har card ka apna **Save** button hai.',
    blocks: [
      { type: 'options', title: 'Business Profile', items: [
        { name: 'Business name / Tagline', text: 'Dukaan ka naam aur chhota sa jumla. Receipt, invoice aur app ke upar nazar aata hai.' },
        { name: 'Phone / WhatsApp number / Email', text: 'Dukaan ke rabte ke number jo print par aate hain.' },
        { name: 'City / Address', text: 'Dukaan ka shehar aur pata.' },
        { name: 'NTN / Tax number', text: 'Agar NTN hai to likhein; A4 invoice par dikhana Printing mein on / off hota hai.' },
      ] },
      { type: 'options', title: 'Regional', items: [
        { name: 'Currency / Timezone', text: 'Pakistan ke liye fix hain: PKR aur Asia/Karachi. Inhein badalne ki zaroorat nahi.' },
        { name: 'Date format', text: 'Tareekh kis tarah likhi jaye.' },
        { name: 'Default measurement unit', text: 'Naap inches mein lena hai ya centimeters mein.' },
        { name: 'Default fabric unit', text: 'Kapra meter mein ya yard mein.' },
      ] },
      { type: 'options', title: 'Numbering', items: [
        { name: 'Prefixes', text: 'Har document ke number ka shuru wala hissa: Order (AZ), Customer code (AZC), Payment receipt (RCP), Expense (EXP), Fabric code (AZF), Supplier code (AZS), Purchase (PUR). Maslan AZ-2026-00001. Kaam shuru hone ke baad inhein na badlein taake numbers ek jaise rahein.' },
      ] },
      { type: 'options', title: 'Orders', items: [
        { name: 'Default delivery time (days)', text: 'Naye order mein delivery ki tareekh khud kitne din aage lagegi.' },
        { name: 'Require advance payment', text: 'On karein to order book karte waqt advance lena zaroori hoga.' },
        { name: 'Minimum advance (%)', text: 'Kam az kam kitne feesad advance lena hai (maslan 50).' },
      ] },
      { type: 'options', title: 'Printing', items: [
        { name: 'Main print for an order', text: 'Order ka print dabane par pehle kya khule: Thermal receipt ya A4 invoice.' },
        { name: 'Thermal receipt width', text: 'Receipt printer ki chaurai: 58 mm ya 80 mm.' },
        { name: 'Receipt copies per print', text: 'Ek dafa print mein kitni copies (customer copy, shop copy).' },
        { name: 'A4 invoice title', text: 'Invoice ke upar ka unwan, maslan "INVOICE" ya "BILL".' },
        { name: 'Show logo / Show NTN / Signature lines', text: 'Receipt aur invoice par logo, NTN aur dastakhat ki lakeerein dikhani hain ya nahi.' },
        { name: 'Open the print window automatically', text: 'Print page khulte hi printer wali window khud khul jaye.' },
        { name: 'Thank-you line / Terms & conditions', text: 'Receipt ke neeche shukriya ka jumla, aur invoice ki sharait (har line par ek shart).' },
      ] },
      { type: 'tip', text: 'Settings page ke upar **Users** aur **Roles & Permissions** ke buttons bhi hain.' },
    ],
  },
  {
    id: 'users', part: 'setup', title: 'Users', icon: 'UserCog', path: '/settings/users', module: 'users',
    summary: 'Users yaani login accounts. Har staff member ka apna login hona chahiye taake har kaam ka record sahi banda dikhaye.',
    blocks: [
      { type: 'steps', title: 'Naya user kaise banaein', items: [
        '**Settings** kholein aur upar **Users** dabaein.',
        '**Add user** dabaein.',
        '**Full name**, **Email** aur **Username** likhein (username se login hoga).',
        '**Initial password** likhein (kam az kam 10 harf, bara + chhota harf + number).',
        '**Roles** mein us ka kaam chunein, maslan Cashier ya Tailor.',
        'Save dabaein aur user ko username / password bata dein. Wo pehli dafa login kar ke **Change Password** se apna password bana le.',
      ] },
      { type: 'options', title: 'Har user ke options', items: [
        { name: 'Edit', text: 'Naam, email, role badalna, ya user ko Active / Inactive karna. Inactive karte hi us ke saare login band ho jate hain.' },
        { name: 'Reset password', text: 'User password bhool jaye to naya password set karna.' },
        { name: 'Status', text: 'Active = chal raha hai, Inactive = band, Locked = ghalat password ki wajah se thori der ke liye band.' },
        { name: 'Last login', text: 'User ne aakhri dafa kab login kiya.' },
      ] },
      { type: 'warning', text: 'Akhri Owner ko kabhi hataya ya band nahi kiya ja sakta, aur sirf Owner hi kisi ko Owner bana sakta hai.' },
    ],
  },
  {
    id: 'roles', part: 'setup', title: 'Roles & Permissions', icon: 'ShieldCheck', path: '/settings/roles', module: 'users',
    summary: 'Role batata hai ke user ERP mein kya dekh aur kya kar sakta hai. ERP mein 8 role pehle se bane hain: Owner, Administrator, Manager, Accountant, Cashier, Inventory Manager, Tailor, Receptionist.',
    blocks: [
      { type: 'options', title: 'Permissions ka matlab (har module ke liye)', items: [
        { name: 'View', text: 'Page dekh sakta hai.' },
        { name: 'Create', text: 'Naya record bana sakta hai (naya customer, order, payment).' },
        { name: 'Edit', text: 'Maujooda record badal sakta hai.' },
        { name: 'Delete', text: 'Record mita / cancel kar sakta hai.' },
        { name: 'Approve', text: 'Manzoori de sakta hai (kharche, chhutti, payroll, price adjustment, stock adjust).' },
        { name: 'Export / Print', text: 'Excel / PDF nikal sakta hai aur print kar sakta hai.' },
        { name: 'Manage settings', text: 'Us module ki settings badal sakta hai (maslan workflow stages, templates).' },
      ] },
      { type: 'steps', title: 'Kisi role ki ijazat kaise badlein', items: [
        '**Settings > Roles & Permissions** kholein.',
        'Baen taraf se role chunein (maslan Tailor).',
        'Table (matrix) mein har module ke saamne jo kaam allow karna hai us ka tick lagaein, jo nahi us ka tick hataein.',
        '**Save changes** dabaein. Tabdeeli foran lagu ho jati hai.',
      ] },
      { type: 'steps', title: 'Naya role kaise banaein', items: [
        '**New role** dabaein.',
        '**Role name**, **Code** aur **Description** likhein, phir **Create role** dabaein.',
        'Ab matrix mein us ke permissions tick karein aur **Save changes** dabaein.',
      ] },
      { type: 'tip', text: 'Misaal: Tailor ko order ka status badalne dena ho to Tailor role mein Orders ke saamne **Edit** tick kar dein.' },
      { type: 'warning', text: 'Owner role hamesha poori ijazat rakhta hai, use kam nahi kiya ja sakta. Default role delete nahi hote.' },
    ],
  },
];
