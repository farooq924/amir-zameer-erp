import type { GuideSection } from './types';

/** Guide sections: offline, sync, security, backup, audit and help. Text in Roman Urdu (owner's request). */
export const SYSTEM_SECTIONS: GuideSection[] = [
  {
    id: 'offline-desk', part: 'offline', title: 'Offline Desk', icon: 'WifiOff', path: '/offline',
    summary: 'Internet band ho jaye tab bhi Offline Desk par kaam chalta rehta hai. Jo kaam yahan save hota hai wo device par rehta hai aur internet aate hi khud server par chala jata hai.',
    blocks: [
      { type: 'options', title: 'Offline Desk par kya ho sakta hai', items: [
        { name: 'New Customer', text: 'Naya customer register karna.' },
        { name: 'Take Measurement', text: 'Naap ka naya version lena.' },
        { name: 'Book Order', text: 'Order book karna: garments, qeemat, delivery date aur advance. Order number sync hone par milta hai.' },
        { name: 'Receive Payment', text: 'Khule order ki payment lena. Receipt number sync ke baad milta hai; receipt order se print karein.' },
        { name: 'Edit / Measure / Book order', text: 'Device par mojood customer chun kar us ki maloomat badlein, naap lein ya order book karein.' },
      ] },
      { type: 'steps', title: 'Offline ke liye tayyari (internet hote hue)', items: [
        'Har device (phone / tablet / computer) par ERP ek dafa internet ke saath kholein aur login karein.',
        '**Offline Desk** kholein aur **Download latest data** dabaein. Customers, templates, garments aur khule orders device mein aa jate hain.',
        'Behtar hai ERP ko app ki tarah install kar lein (**Sync Center > Offline app > Install app**).',
      ] },
      { type: 'tip', text: '"Waiting to sync" card batata hai kitni entries abhi server par nahi gayin. **Saved on this device** list mein har entry ka haal hai. "Nothing waiting" ka matlab sab server par pohnch gaya.' },
    ],
  },
  {
    id: 'sync-center', part: 'offline', title: 'Sync Center', icon: 'RefreshCw', path: '/sync',
    summary: 'Sync Center mein offline save hone wala kaam, conflicts (takrao) aur sync ki poori history hai.',
    blocks: [
      { type: 'options', title: 'Tabs', items: [
        { name: 'This device', text: 'Is device par intezar karne wali entries. **Sync now** se foran bhejein, **Retry** dobara koshish, **Discard entry** entry hatana (ehtiyaat se).' },
        { name: 'Conflicts', text: 'Jab ek customer ko do devices par alag badla gaya ho, ya naye customer ka number pehle se mojood ho. **Review** dabaein.' },
        { name: 'Sync log', text: 'Har synced entry ki history: Saved, Conflict, Rejected; record type aur user / device ke filter.' },
        { name: 'Offline app', text: 'Device offline ke liye tayyar hai ya nahi, **Install app**, device ka naam (**Device name** > **Save name**), aur pichle 30 din mein sync karne wale devices.' },
      ] },
      { type: 'options', title: 'Conflict ka faisla (Review)', items: [
        { name: 'Keep server copy', text: 'Server wali maloomat rakhein, device wali chhor dein.' },
        { name: 'Keep device copy', text: 'Device wali maloomat rakhein.' },
        { name: 'Save merged', text: 'Har khane ke liye khud chunein ke kaunsi value rakhni hai.' },
        { name: 'Use existing customer', text: 'Duplicate number par: purana customer hi istemal karein (order usi mein chala jayega).' },
        { name: 'Save as a separate customer', text: 'Waqai naya banda hai to alag customer bana dein.' },
      ] },
      { type: 'steps', title: 'App kaise install karein', items: [
        'Android / Chrome / Edge: browser menu kholein aur "Install app" ya "Add to Home screen" dabaein (ya Sync Center mein **Install app**).',
        'iPhone / iPad (Safari): Share dabaein, phir "Add to Home Screen".',
      ] },
    ],
  },
  {
    id: 'security', part: 'security', title: 'Security', icon: 'Lock', path: '/security',
    summary: 'Security Center batata hai ERP kitna mehfooz hai, kaun kahan login hai, kis ne kab login kiya, aur kaun se account lock hain.',
    blocks: [
      { type: 'options', title: 'Tabs', items: [
        { name: 'Overview', text: '**Security score** aur **Security checklist**: har nukta (HTTPS, Owner password, backups, recovery key, second copy, demo data ...) hara ya "Needs attention". Saamne **Open** dabane se seedha theek karne ki jagah khulti hai. Pichle 24 ghante ke ghalat login bhi.' },
        { name: 'Signed-in devices', text: 'Saare login devices. **Whose devices** mein All users ya Only mine. Kisi device ke saamne **Sign out**, ya **Sign out my other devices** se apne baqi sab devices band (ye device chalta rahega).' },
        { name: 'Login history', text: 'Pichle 180 din ke saare login: All logins, Failed only, Successful only; username ya address se search.' },
        { name: 'Locked accounts', text: 'Ghalat password ki wajah se lock hue accounts. **Unlock** se foran khol dein.' },
      ] },
      { type: 'tip', text: 'Har user apne devices account menu ke **My Devices** se dekh sakta hai. Phone gum ho jaye to foran us device ko Sign out kar dein aur password badal lein.' },
    ],
  },
  {
    id: 'backup', part: 'security', title: 'Backup & Restore', icon: 'DatabaseBackup', path: '/backup', module: 'backup',
    summary: 'Backup ERP ke saare data ki mehfooz (encrypted) copy hai. Rozana khud banta hai. Computer kharab ho jaye to isi se saara data wapas aata hai. TailoringERP mein Backup sirf Super Admin (Brandistan) ke menu mein hai aur ek backup mein tamam companies ka data hota hai.',
    blocks: [
      { type: 'steps', title: 'Pehli dafa ye zaroor karein', items: [
        '**Backup** kholein aur **Download recovery key** (ya **Download key**) dabaein, apna password daalein. Key file USB aur kisi mehfooz jagah sambhal lein. Is ke baghair naye computer par backup nahi khulta.',
        '**Automatic backup** card mein **Daily automatic backup** on rakhein, **Time (Karachi)** chunein (default raat 11 baje) aur **Keep (automatic)** (kitne purane backup rakhne hain, default 14).',
        '**Second copy folder** mein USB ya Google Drive / OneDrive folder ka rasta likhein (jaise E:\\ERP-Backups). Har backup ki copy wahan bhi jayegi.',
        '**Check every backup after saving** on rakhein aur **Save settings** dabaein.',
        'Upar **Back up now** dabaein taake pehla backup ban jaye.',
      ] },
      { type: 'options', title: 'Upar ke cards aur buttons', items: [
        { name: 'Last good backup / Next automatic backup', text: 'Aakhri theek backup kab bana aur agla kab banega.' },
        { name: 'Backups kept / Failed in last 24 hours', text: 'Kitne backup mojood hain, aur koi fail to nahi hua.' },
        { name: 'Back up now', text: 'Abhi backup banana. **Note for the next backup** mein note likh sakte hain (jaise "Saal ke aakhir se pehle").' },
        { name: 'Scan folder', text: 'Backups folder mein rakhi files dobara parh kar list banana.' },
      ] },
      { type: 'options', title: 'Har backup ke actions', items: [
        { name: 'Download', text: 'Backup file computer mein save karna.' },
        { name: 'Check file', text: 'File theek hai ya kharab, check karna.' },
        { name: 'Restore test', text: 'Backup ko ek alag aarzi database mein khol kar records ginna. Asal data ko haath nahi lagta. Mahine mein ek dafa zaroor karein.' },
        { name: 'Restore this backup', text: 'Saara maujooda data is backup se badal dena (sirf Owner).' },
        { name: 'Delete', text: 'Backup hatana.' },
      ] },
      { type: 'steps', title: 'Restore kaise karein (sirf zaroorat par)', items: [
        'Backup ki list mein sahi backup ke saamne actions kholein aur **Restore this backup** dabaein.',
        '**Your password** mein Owner ka password likhein.',
        '**Type RESTORE to confirm** mein bare haroof mein RESTORE likhein.',
        '**Restore** dabaein aur page band na karein. ERP pehle check aur test karta hai, phir maujooda data ka "safety backup" banata hai, phir ek hi qadam mein data badalta hai.',
        'Sab users ko dobara login karna hoga.',
      ] },
      { type: 'warning', text: 'Restore se backup ke baad ka saara kaam khatam ho jata hai. Sirf tab karein jab data waqai kharab ya gum ho gaya ho. Shak ho to pehle Brandistan se rabta karein.' },
    ],
  },
  {
    id: 'audit-logs', part: 'security', title: 'Audit Logs', icon: 'ShieldCheck', path: '/audit-logs', module: 'audit_logs',
    summary: 'Audit Logs har login aur har ahem tabdeeli ka pakka record hai: kis ne, kab, kya badla. Ye record koi nahi mita sakta.',
    blocks: [
      { type: 'options', title: 'Options', items: [
        { name: 'Date range', text: 'Kis waqt ka record dekhna hai.' },
        { name: 'Module / Action', text: 'Sirf kisi ek module (Orders, Payments ...) ya kisi ek kaam (create, update, delete, login) ka record.' },
        { name: 'View details', text: 'Tabdeeli se pehle aur baad ki values dekhna.' },
        { name: 'Columns', text: 'Time, User, Action, Module aur IP address.' },
      ] },
      { type: 'tip', text: 'Kisi order ya payment mein shak ho to yahan dekhein ke kis ne kab badla. Password aur khufiya cheezein record mein nahi likhi jatin.' },
    ],
  },
  {
    id: 'routine', part: 'help', title: 'Daily, Monthly & Yearly Routine', icon: 'CalendarCheck',
    summary: 'ERP ko sahi chalane ke liye rozana, mahana aur saalana kaam ki chhoti si list.',
    blocks: [
      { type: 'steps', title: 'Rozana (har din)', items: [
        'Subah **Attendance > Daily** mein haazri lagaein aur **Save attendance** dabaein.',
        '**Orders** mein **Due today** aur **Overdue** dekhein.',
        'Har naya customer, naap aur order foran ERP mein darj karein; advance zaroor likhein.',
        'Kaam aage barhe to order ka **Update status** karein; tayyar ho to Ready karein (customer ko WhatsApp).',
        'Customer kapre le jaye to **Deliver** karein aur baqi paisa usi waqt lein.',
        'Karigaron ka kaam **Production > Record work** mein likhein.',
        'Har kharcha **Expenses > Add expense** mein likhein.',
        'Shaam ko **Dashboard** par aaj ki sale aur cash dekhein.',
      ] },
      { type: 'steps', title: 'Mahana (mahine ke aakhir mein)', items: [
        '**Expenses > Recurring > Create due expenses** se kiraya, bills banaein.',
        'Overtime aur chhuttiyan approve karein.',
        '**Payroll > Run payroll**, check, **Approve**, phir **Pay all** aur payslips print.',
        'Suppliers ke bill aur payments check karein.',
        '**Reports** mein Profit & Loss, Customer Outstanding aur Fabric Stock dekhein.',
        '**Accounting > Month Closing** mein mahina **Close month** karein.',
        '**Backup** mein ek **Restore test** karein.',
      ] },
      { type: 'steps', title: 'Saalana (saal ke aakhir mein)', items: [
        'Kapre ki ginti kar ke **Adjust stock** se stock theek karein.',
        'Balance Sheet aur Profit & Loss print / PDF kar ke sambhal lein.',
        'Tax ke baad purane mahine **Lock for ever** karein.',
        'Users ki list dekhein; jo staff chhor gaya us ka login Inactive karein.',
      ] },
    ],
  },
  {
    id: 'faq', part: 'help', title: 'Common Problems & Answers', icon: 'CircleHelp',
    summary: 'Aam sawaal aur un ke aasan jawab.',
    blocks: [
      { type: 'options', title: 'Sawaal / Jawab', items: [
        { name: 'Menu mein koi page nazar nahi aa raha', text: 'Aap ke role ko us ki ijazat nahi. Owner se kahein ke **Settings > Roles & Permissions** mein View tick kare.' },
        { name: '"Access denied" likha aata hai', text: 'Wohi baat: role mein ijazat nahi. Upar wala jawab dekhein.' },
        { name: 'Account lock ho gaya', text: '15 minute intezar karein, ya Owner **Security > Locked accounts > Unlock** kare.' },
        { name: 'Password bhool gaya', text: 'Owner / Administrator **Settings > Users > Reset password** se naya password de.' },
        { name: 'Customer ka naya order nahi ban raha', text: 'Customer "Blocked" hai. Profile mein **More actions > Mark active** karein.' },
        { name: 'Ghalat payment darj ho gayi', text: '**Payments > Customer receipts** mein us receipt par **Reverse receipt** karein, phir sahi payment lein.' },
        { name: 'Deliver shuda order ki qeemat badalni hai', text: 'Order mein **More actions > Price adjustment**.' },
        { name: 'Haazri ya production badal nahi rahi', text: 'Us mahine ka payroll approve ho chuka. **Payroll** mein us mahine ko **Reopen** karein (agar salary ada nahi hui).' },
        { name: 'Kapra order mein nahi aa raha', text: '**Fabric Inventory** mein check karein ke kapra Active hai aur "Free to use" stock mojood hai.' },
        { name: 'Report khali hai', text: 'Period aur filters check karein; **Reset filters** dabaein.' },
        { name: 'Internet chala gaya', text: '**Offline Desk** par kaam jaari rakhein. Internet aate hi khud sync ho jayega.' },
        { name: 'Print ke neeche ka footer', text: 'Har print par "Software developed by Brandistan | www.brandistan.pk | 0333-2532924" aata hai. Ye software banane wale ka rabta hai.' },
      ] },
    ],
  },
  {
    id: 'update-support', part: 'help', title: 'Updating the ERP & Support', icon: 'Download',
    summary: 'Naya update aane par ERP kaise update karein, aur madad ke liye kis se rabta karein.',
    blocks: [
      { type: 'steps', title: 'Update kaise lagaein (dukaan ke computer par)', items: [
        'Update ki zip file download karein aur extract karein.',
        'Extract hone wale saare folders aur files copy kar ke apne ERP folder (D:\\Claude-AI\\amir-zameer-erp) mein paste karein. Windows poochhe to "Replace the files in the destination" chunein.',
        'Start menu mein "PowerShell" likhein, us par right click kar ke "Run as administrator" dabaein.',
        'Ye likh kar Enter dabaein: cd D:\\Claude-AI\\amir-zameer-erp',
        'Phir ye likh kar Enter dabaein: Get-ChildItem -Recurse -File | Unblock-File',
        'Phir ye likh kar Enter dabaein: powershell -ExecutionPolicy Bypass -File .\\scripts\\update-erp.ps1',
        'Script khud backup banati hai, update lagati hai aur ERP dobara chalu karti hai. "Update finished. The ERP is running again." aane tak window band na karein, phir Enter dabaein.',
        'Browser mein ERP kholein, Ctrl + F5 dabaein, aur side menu ke neeche naya version check karein.',
      ] },
      { type: 'tip', text: 'Side menu ke neeche version par click karein to "About" mein har update ki tafseel likhi hoti hai.' },
      { type: 'para', title: 'Rabta (Support)', text: 'Software developed by Brandistan. Website: www.brandistan.pk. Phone / WhatsApp: 0333-2532924.' },
    ],
  },
];
