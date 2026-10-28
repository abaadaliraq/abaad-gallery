# ABAAD EXHIBIT — Exhibition Management Platform

المرحلة الأولى: بوابة دخول الموظفين والصلاحيات فقط، ضمن مشروع Next.js الحالي.

## تشغيل محلي

```powershell
cd C:\HOA-SYSTEM\gallery-org
npm install
Copy-Item .env.example .env.local
# أدخل URL وPublishable Key في .env.local ثم أعد تشغيل الخادم
npm run dev
```

افتح http://localhost:3000. تعمل واجهة الأقسام والنماذج دون إعداد الاتصال، لكنها لا تسمح بدخول تجريبي.

## ما نُفذ

- واجهة عربية RTL، بطاقات أقسام متساوية، تصميم متجاوب بألوان الهوية، وأيقونات SVG خفيفة.
- نموذج مشترك: تحقق عربي في العميل والخادم، إظهار/إخفاء كلمة المرور، Enter، منع تكرار الإرسال، وحالة تحميل.
- Supabase Auth عبر Server Actions وSSR cookies؛ لا تُخزّن الصلاحيات في LocalStorage.
- جلسات HttpOnly وSameSite=Lax وSecure في الإنتاج (يلزم HTTPS).
- تحديث الجلسات في src/proxy.ts، وفحص getUser والدور الفعلي في كل صفحة محمية.
- كل دور يدخل مساره فقط، بما فيه admin؛ لا يوجد تجاوز تلقائي للأقسام الأخرى.
- جدول staff_roles هو مصدر الصلاحية؛ يتم رفض الموظف المعطّل أو غير المسجّل، ورفض أخطاء الاستعلام.
- صفحات أولية تعرض اسم الموظف والقسم وحالة التجهيز وزر تسجيل خروج للجلسة الحالية.
- لا توجد وظائف الضيوف أو المبيعات أو إدارة الموظفين في هذه المرحلة.

## إعداد Supabase المطلوب — لم يُنفّذ خارجياً

1. اختر مشروع Supabase المقصود واملأ NEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY في .env.local. لا تستخدم service_role أو مفاتيح سرية.
2. راجع supabase/staff_roles.sql ونفّذه يدوياً مرة واحدة على المشروع المقصود. يفشل بأمان إذا كان الجدول موجوداً؛ لا يحذف بيانات.
3. عطّل السماح بالتسجيل العام للمستخدمين الجدد من إعدادات Auth. لا توجد واجهة إنشاء حسابات هنا، وإغلاق التسجيل في Supabase مطلوب أيضاً.
4. فعّل تسجيل الدخول بالبريد وكلمة المرور. أنشئ حسابات الموظفين من لوحة Supabase الإدارية، وتحقق من تأكيد البريد.
5. أضف لكل مستخدم سجلاً في staff_roles باستخدام معرفه من Auth والاسم والدور protocol أو sales أو admin.
6. سياسات RLS تسمح للموظف بقراءة دوره الفعّال فقط. لا يملك أي مستخدم تطبيق، حتى admin، تعديل الأدوار. الإعداد الحالي عبر الإدارة الموثوقة/SQL فقط إلى حين بناء إدارة الموظفين لاحقاً.
7. أعد التشغيل بعد تغيير الإعدادات، وأعد البناء قبل تشغيل نسخة الإنتاج. لا تضع CDN cache على مسارات الجلسات.

تعطيل is_active يمنع الوصول في الطلب التالي. أي بيانات مستقبلية تحتاج سياسات RLS خاصة بها وفحص صلاحية في عمليات الخادم؛ حماية الصفحة وحدها لا تكفي لحماية جداول جديدة.

## الفحوصات

```powershell
npm run test:auth
npm run lint
npm run typecheck
npm run build
```

اختبارات auth تستخدم بدائل محلية لخدمة Supabase لاختبار قرار السماح والمنع. لا تستبدل اختبار قاعدة البيانات أو الجلسات الحقيقية.

لم تُختبر بحسابات Supabase حقيقية: تسجيل الدخول والخروج لكل دور، تجديد وانتهاء الجلسة، سياسات RLS داخل قاعدة البيانات، تغيير الدور وتعطيل الحساب الفعلي. اختبر ثلاثة حسابات حقيقية: تسجيل الدخول الصحيح، اختيار قسم آخر بكلمة مرور صحيحة، فتح المسارات مباشرة، تحديث الصفحة، انتهاء الجلسة، وتسجيل الخروج ثم العودة بالرابط/زر الرجوع. ليست المصادقة معتمدة للإنتاج قبل هذه الاختبارات.

## هيكل المشروع

```text
src/
  app/
    page.tsx
    layout.tsx
    globals.css
    error.tsx
    protocol/page.tsx
    sales/page.tsx
    admin/page.tsx
  components/
    access/
      AccessPortal.tsx
      AccessCard.tsx
      AccessIcon.tsx
      PortalShell.tsx
      AccessLoading.tsx
      LoginForm.tsx
      ProtocolAccess.tsx
      SalesAccess.tsx
      AdminAccess.tsx
    sections/
      ProtocolSection.tsx
      SalesSection.tsx
      AdminSection.tsx
      SectionPlaceholder.tsx
      LogoutButton.tsx
  lib/
    access.ts
    auth/
      actions.ts
      authorization.ts
      validation.ts
    supabase/
      config.ts
      server.ts
  types/auth.ts
  proxy.ts
supabase/staff_roles.sql
tests/auth.test.mjs
.env.example
```

page.tsx يستدعي المكونات فقط. كل مكون يحتفظ بتنسيقه باستخدام Tailwind داخل TSX. globals.css للإعدادات العامة والخطوط والألوان فقط. تُحمّل IBM Plex Sans Arabic وDM Sans باستخدام next/font/google في layout.tsx بأوزان 400 و500 و600، مع display: swap وخطوط بديلة. يتطلب البناء الأول اتصالاً بخوادم Google Fonts؛ تُقدّم الخطوط لاحقاً من ملفات المشروع دون طلبات Google من المتصفح.

الحزم المضافة فقط: @supabase/ssr 0.12.7 و@supabase/supabase-js 2.118.0 وserver-only 0.0.1، بإصدارات مثبتة وملف قفل محدّث. بقيت إعدادات Next.js وCache Components الأصلية؛ قراءات الجلسة خلف Suspense دون تخزين بيانات المستخدم في كاش مشترك.

مرجع إعداد الجلسات: https://supabase.com/docs/guides/auth/server-side/creating-a-client


## هوية المنتج والمعرض

- src/config/branding.ts: اسم المنتج، وصفه، المطوّر، سنة حقوق المنتج، اللغة واتجاه الواجهة.
- src/config/exhibition.ts: اسم المعرض، الجهة المستضيفة، المدينة والمنطقة، السنة، بيانات الهوية والألوان السبعة.
- لتغيير العميل أو المعرض عدّل exhibition.ts فقط، ولتغيير هوية المنتج عدّل branding.ts، ثم أعد البناء.
- تُربط الألوان بمتغيرات CSS في layout.tsx، وتستخدم المكونات أسماء Tailwind الدلالية مثل bg-surface وtext-muted وborder-line. التنسيقات الخاصة تبقى داخل TSX.
- الخطوط وإعداداتها في layout.tsx؛ النصوص الإنكليزية معلّمة lang=en، وحقول البريد وكلمة المرور تستخدم خط DM Sans.
- PortalShell يعرض المنتج يساراً والمعرض يميناً، مع Footer ينسب التطوير إلى ABAAD IRAQ. ExhibitionIdentity مكوّن مشترك لبيانات المعرض الثانوية.
- هذا فصل إعدادات العرض فقط؛ لم يُنفّذ نظام متعدد العملاء أو أي فصل بيانات جديد.
- لم تتغيّر ملفات المصادقة والجلسات وحماية المسارات وSQL أثناء تحسين الهوية.

## Phase 02 — Authentication & Database Security

راجع docs/security-phase02.txt للتقرير الحالي وخطة التطبيق والاختبارات. الاتصال بمشروع ABAAD-EXHIBIT تم التحقق منه، لكن SQL لم يُطبّق والتسجيل العام يحتاج إغلاقاً بعد الموافقة. لا يُعد النظام جاهزاً للإنتاج. الاختبارات المحلية 46/46؛ اختبارات الحسابات وRLS الحقيقية معلّقة. تستخدم الجلسات الآن تنظيفاً محلياً إلزامياً وكتابة Cookies صريحة في Actions وانتقالاً كاملاً بعد الدخول والخروج. لتجربة حسابات محلياً عبر HTTP استخدم npm run dev؛ نسخة الإنتاج تتطلب HTTPS لحفظ Secure Cookies. لا تنفذ ملفي التثبيت والترقية معاً، ولا تشغّل SQL قبل اعتماد التغييرات على المشروع المؤكد.


## Phase 03 — Protocol & Guest Relations

قسم التشريفات في /protocol وإدارة الضيوف المحدودة في /admin/guests. راجع docs/protocol-phase03.txt للتنفيذ والصلاحيات وCloudinary ونتائج الاختبارات. ملف supabase/protocol.sql مُجهّز ومختبر على PostgreSQL محلي معزول فقط؛ لم يُطبّق على قاعدة Supabase الخارجية. يحتاج تطبيقه موافقة صريحة، ثم ربط موظفي التشريفات بالمعرض وإدخال قائمة الضيوف الفعلية. لا توجد بيانات بديلة في المنتج، ولا تغييرات على Auth أو staff_roles. لا يُعد التزامن أو RLS الخارجي أو الصور معتمداً للإنتاج قبل الاختبارات الحقيقية. أوامر الاختبارات الجديدة: npm run test:protocol وnpm run test:protocol:db.

