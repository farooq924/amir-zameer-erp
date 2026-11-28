import type { GuideSection } from './types';

/** TailoringERP (SaaS) sections. Text in Roman Urdu (owner's request). */
export const SAAS_INTRO_SECTIONS: GuideSection[] = [
  {
    id: 'tailoringerp', part: 'start', title: 'TailoringERP: Company & Subscription', icon: 'Building2',
    summary: 'TailoringERP By Brandistan ek hi ERP hai jo bohat si tailoring shops (companies) istemal karti hain. Har company ka data bilkul alag hai: ek company doosri ka koi customer, order ya hisaab kabhi nahi dekh sakti.',
    blocks: [
      { type: 'options', title: 'Aham baatein', items: [
        { name: 'Aap ki company', text: 'Login karte hi aap ki company khud khul jati hai. Side menu mein **TailoringERP** ke neeche aap ki company (dukaan) ka naam likha hota hai.' },
        { name: 'Plan', text: 'Har company ka ek plan hota hai (Basic, Standard, Premium). Plan batata hai ke kitne users ban sakte hain aur kaun se modules (jaise Fabric Inventory, Payroll, Accounting, WhatsApp) menu mein nazar aayenge. Jo module plan mein nahi wo menu mein nazar nahi aata.' },
        { name: 'Free trial', text: 'Nayi company ko 14 din ka free trial milta hai. Trial ya subscription khatam hone se 7 din pehle upar sunehri patti mein yaad-dehani aati hai.' },
        { name: 'Grace period', text: 'Subscription khatam hone ke baad kuch din (aam tor par 7) ERP pehle ki tarah chalta hai aur upar peeli patti mein likha hota hai ke kab tak renew karna hai.' },
        { name: 'Read-only', text: 'Grace ke din bhi guzar jaein to ERP "read-only" ho jata hai: aap sab kuch dekh aur print kar sakte hain lekin naya record add ya change nahi hota. Upar laal patti nazar aati hai. Payment hote hi ERP foran poora chalu ho jata hai.' },
        { name: 'Suspended', text: 'Agar Brandistan ne company band (suspend) ki ho to login par paigham aata hai. Rabta karein.' },
      ] },
      { type: 'steps', title: 'Subscription renew kaise karein', items: [
        'Brandistan ko JazzCash, EasyPaisa ya bank se payment bhejein.',
        'Transaction ID ke saath WhatsApp karein: 0333-2532924.',
        'Brandistan payment ko ERP mein "Paid" mark karta hai. Page refresh karein (Ctrl + F5), patti hat jayegi.',
      ] },
      { type: 'para', title: 'Users ki hadd', text: 'Plan mein jitne users likhe hain usse zyada active users nahi ban sakte. Zyada users chahiye to plan barhwaein, ya kisi purane user ko **Deactivate** kar dein.' },
      { type: 'tip', text: 'Prints (receipt, invoice, job card, payslip) par aap ki dukaan ka naam, pata, phone aur logo aata hai. Logo **Settings > Business Profile > Shop logo** se lagaein. Har print ke neeche Brandistan ka footer hamesha rehta hai.' },
      { type: 'tip', text: 'Backup ab poore system ka ek saath Brandistan (Super Admin) banata hai, is liye company ke menu mein Backup nazar nahi aata.' },
    ],
  },
];

/** Super Admin (Brandistan) sections: only shown to the Super Admin. */
export const PLATFORM_SECTIONS: GuideSection[] = [
  {
    id: 'super-admin', part: 'platform', title: 'Super Admin Overview', icon: 'Crown', path: '/platform', superAdmin: true,
    summary: 'Super Admin (Brandistan) poore TailoringERP ka malik hai: companies banata hai, plan aur payment sambhalta hai, aur zaroorat par kisi company mein madad ke liye jata hai.',
    blocks: [
      { type: 'steps', title: 'Pehli dafa Super Admin login banana', items: [
        'Dukaan ke computer par admin PowerShell kholein aur ERP folder mein jaein: cd D:\\Claude-AI\\amir-zameer-erp',
        'Ye likh kar Enter dabaein: powershell -ExecutionPolicy Bypass -File .\\scripts\\create-super-admin.ps1',
        'Username, poora naam, email (marzi) aur password likhein. Password kam az kam 10 haroof ka ho, jis mein bara (capital) aur chhota harf aur number ho.',
        'Ab browser mein ERP kholein aur isi username / password se login karein. Seedha **Super Admin** overview khulega.',
      ] },
      { type: 'options', title: 'Overview ke cards', items: [
        { name: 'Companies', text: 'Kul companies, kitni active aur kitni trial par.' },
        { name: 'Monthly recurring', text: 'Active (paid) companies ke plans ki mahana qeemat ka jor.' },
        { name: 'Received this month', text: 'Is mahine kitni payment aayi.' },
        { name: 'Active users', text: 'Tamam companies ke active users.' },
        { name: 'Grace period / Read-only / Suspended', text: 'Kitni companies ki subscription khatam hai, kitni read-only aur kitni band hain.' },
        { name: 'Ending in the next 7 days', text: 'Jin ka trial ya subscription agle 7 din mein khatam ho raha hai: inhein renew ki yaad dilaein.' },
      ] },
      { type: 'para', title: 'Menu', text: 'Super Admin ke menu mein **Overview**, **Companies**, **Subscription Payments**, **Plans**, **Backup**, **Platform Activity** aur **Documents** hain. Kisi company ka data dekhne ke liye pehle us company ko **Open company** karna hota hai.' },
    ],
  },
  {
    id: 'platform-companies', part: 'platform', title: 'Companies (Create, Open, Suspend)', icon: 'Building2', path: '/platform/companies', superAdmin: true,
    summary: 'Nayi dukaan ko TailoringERP dena, us ki tafseel badalna, madad ke liye us ki company kholna, aur payment na hone par band karna.',
    blocks: [
      { type: 'steps', title: 'Nayi company banana', items: [
        '**Companies** kholein aur **New company** dabaein.',
        '**Company / shop name** likhein. **Company code** khali chhor dein (naam se khud banta hai) aur **Document prefix** mein 1 se 4 haroof (jaise ZA) likhein; is company ke order number ZA-2026-00001 jaise banenge.',
        'Owner ka naam, phone, email, shehar aur pata likhein.',
        '**Plan** chunein. **Start with a free trial** on rahe to 14 din ka trial milega (din badal bhi sakte hain). Trial nahi dena to tick hata kar **Paid until** ki tareekh dein.',
        '**Owner login** mein dukaan ke malik ka naam, email, username aur password (kam az kam 10 haroof) likhein.',
        '**Create company** dabaein. Company apne roles, order stages, garments aur settings ke saath tayyar ho jati hai. Owner ko username aur password de dein.',
      ] },
      { type: 'options', title: 'Company page ke buttons', items: [
        { name: 'Open company', text: 'Madad (support) ke liye company ke andar jana. Upar sunehri patti aati hai: "Support access". Aap jo bhi karein wo company ke Audit Log aur Platform Activity dono mein likha jata hai. Kaam khatam ho to **Back to Super Admin** dabaein.' },
        { name: 'Record payment', text: 'Company ki payment darj karna (agla section dekhein).' },
        { name: 'Edit company & plan', text: 'Naam, phone, pata, plan, status (Trial / Active), trial ki aakhri tareekh, **Paid until**, **No expiry** aur **Grace days** badalna.' },
        { name: 'Reset Owner password', text: 'Malik password bhool jaye to naya password lagaein. Woh har device se logout ho jata hai.' },
        { name: 'Suspend', text: 'Company band karna (wajah likhni zaroori hai). Us ke saare users foran logout ho jate hain aur login nahi kar sakte. Data delete nahi hota.' },
        { name: 'Activate', text: 'Band company ko dobara chalu karna.' },
      ] },
      { type: 'tip', text: 'Companies list mein filter se **Ending within 7 days** ya **Read-only (expired)** wali companies alag dekh sakte hain. Har row ke aakhir mein Open (teer) ka nishan company ko foran kholta hai.' },
      { type: 'warning', text: 'Plan chhota karte waqt agar company ke active users naye plan ki hadd se zyada hon to ERP mana karega. Pehle company ke kuch users deactivate karein.' },
    ],
  },
  {
    id: 'platform-payments', part: 'platform', title: 'Subscription Payments', icon: 'CreditCard', path: '/platform/payments', superAdmin: true,
    summary: 'Companies JazzCash, EasyPaisa, bank ya cash se payment karti hain. Payment milne par use ERP mein "Paid" mark karein; subscription khud aage barh jati hai.',
    blocks: [
      { type: 'steps', title: 'Payment darj karna', items: [
        '**Companies** mein company kholein aur **Record payment** dabaein.',
        '**Months** likhein (kitne mahine ki payment hai). **Amount** khud plan ki qeemat x mahine ban jata hai; zaroorat ho to badal dein.',
        '**Method** (JazzCash, EasyPaisa, Bank transfer, Cash, Other), **Paid on** tareekh aur **Transaction ID / reference** likhein.',
        '**Mark as paid** dabaein. Subscription purani aakhri tareekh (ya aaj) se utne mahine aage barh jati hai, trial wali company Active ho jati hai aur read-only khatam ho jata hai.',
      ] },
      { type: 'para', title: 'Subscription Payments page', text: 'Tamam companies ki payments ek list mein, upar kul raqam. Company ya reference se dhoond sakte hain.' },
    ],
  },
  {
    id: 'platform-plans', part: 'platform', title: 'Plans', icon: 'Package', path: '/platform/plans', superAdmin: true,
    summary: 'Plan ki mahana qeemat, users ki hadd aur extra modules yahan se badlein. Tabdeeli us plan wali har company par foran lagti hai.',
    blocks: [
      { type: 'options', title: 'Plan ke khane', items: [
        { name: 'Code / Name', text: 'Code (jaise GOLD) sirf naya plan banate waqt likha jata hai; naam baad mein bhi badal sakta hai.' },
        { name: 'Monthly price (PKR)', text: 'Ek mahine ki qeemat. Payment form mein raqam isi se banti hai.' },
        { name: 'Max users', text: 'Company mein zyada se zyada kitne active users.' },
        { name: 'Extra modules', text: 'Fabric Inventory, Purchases, Suppliers, Expenses, WhatsApp, Employees, Attendance, Production, Payroll, Accounting. Customers, Measurements, Orders, Garments, Payments, Reports, Settings har plan mein hamesha hote hain.' },
        { name: 'Available for new companies', text: 'Tick hatane se plan naye companies ke liye list mein nahi aata; purani companies par chalta rehta hai.' },
      ] },
      { type: 'tip', text: 'Shuru ke plans: Basic (Rs 2,000, 3 users, sirf core modules), Standard (Rs 4,000, 8 users, + inventory, purchases, suppliers, expenses, WhatsApp), Premium (Rs 7,000, 25 users, sab modules). Qeematein apni marzi se badlein.' },
    ],
  },
  {
    id: 'platform-activity', part: 'platform', title: 'Platform Activity & Backup', icon: 'History', path: '/platform/activity', superAdmin: true,
    summary: 'Super Admin ke har kaam ka record, aur poore system ka backup.',
    blocks: [
      { type: 'para', title: 'Platform Activity', text: 'Company banana, plan badalna, payment, suspend / activate, password reset aur har "Open company" (support visit) yahan tareekh, waqt aur IP ke saath likha jata hai. Ye record na badla ja sakta hai na mitaya.' },
      { type: 'para', title: 'Backup', text: 'Backup ab sirf Super Admin ke paas hai aur ek hi backup mein tamam companies ka data hota hai. **Backup** page ka tareeqa wahi hai jo "Backup & Restore" section mein likha hai.' },
      { type: 'warning', text: 'Restore poore system (tamam companies) ka data purane waqt par le jata hai. Sirf sakht zaroorat mein karein.' },
    ],
  },
];
