import LoginForm from "./LoginForm";
export default function SalesAccess({ onBack }: { onBack: () => void }) {
  return <LoginForm role="sales" onBack={onBack}/>;
}
