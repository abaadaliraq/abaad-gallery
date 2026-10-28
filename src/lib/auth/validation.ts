export function validateCredentials(email: string, password: string) {
  const fields: { email?: string; password?: string } = {};
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "أدخل بريداً إلكترونياً صحيحاً.";
  if (!password) fields.password = "أدخل كلمة المرور.";
  else if (password.length > 1024) fields.password = "كلمة المرور أطول من الحد المسموح.";
  return fields;
}
