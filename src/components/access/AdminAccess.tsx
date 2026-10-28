import LoginForm from "./LoginForm";
export default function AdminAccess({ onBack }: { onBack: () => void }) {
  return <LoginForm role="admin" onBack={onBack}/>;
}
