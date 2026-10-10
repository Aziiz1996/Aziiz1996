import { ExternalLink, GraduationCap, BookOpen } from 'lucide-react';
import { SectionHeader } from './ui';

export default function UniversityPage() {
  return <div className="page-content stack">
    <SectionHeader eyebrow="جامعتك في مكان واحد" title="الجامعة السعودية الإلكترونية — الكلية التطبيقية" description="روابط الجامعة ومنصة الدراسة لدبلوم سلاسل الإمداد." />
    <div className="note-grid">
      <section className="card stack"><GraduationCap size={28} /><h2>موقع الجامعة السعودية الإلكترونية</h2><p>راجع أخبار الجامعة وخدماتها ومعلومات القبول والكلية التطبيقية من الموقع.</p><a className="btn btn-primary" href="https://seu.edu.sa/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح موقع الجامعة</a></section>
      <section className="card stack"><BookOpen size={28} /><h2>منصة الدراسة — مودل</h2><p>افتح رابط منصة الدراسة الذي أرسلته وسجّل دخولك لدى المنصة لعرض موادك.</p><a className="btn btn-primary" href="https://lms.ac-seu.com/login/index.php?loginredirect=1" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح منصة الدراسة</a></section>
      <section className="card stack"><ExternalLink size={28} /><h2>Microsoft Teams — حضور المحاضرات والدورات</h2><p>افتح Teams وسجّل دخولك بحساب الجامعة، ثم اختر الفريق أو الاجتماع المتاح لك. يمكن إضافة رابط اجتماع محدد من إعداد موعد المحاضرة.</p><a className="btn btn-primary" href="https://teams.microsoft.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح Teams</a><p className="muted">هذا رابط Teams العام؛ لا ينضم لاجتماع تلقائياً ولا يثبت حضورك. استخدامه للمحاضرات يعتمد على ما تحدده الجامعة.</p></section>
    </div>
    <p className="notice">هذه اختصارات لفتح المواقع. لا تسجّل الدخول تلقائياً ولا تجلب بيانات حسابك إلى التطبيق. رابط منصة الدراسة مقدّم منك؛ لم يتم التحقق من تبعيته للجامعة.</p>
  </div>;
}
