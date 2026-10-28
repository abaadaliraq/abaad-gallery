import LoginForm from "./LoginForm";
export default function ProtocolAccess({ onBack }: { onBack: () => void }) {
  return <LoginForm role="protocol" onBack={onBack}/>;
}
