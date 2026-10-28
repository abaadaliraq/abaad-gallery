import LiveStatus from "@/components/live/LiveStatus";
export default function AdminStatus(props: {
  error?: string;
  loading?: boolean;
  updating?: boolean;
  slow?: boolean;
  limited?: boolean;
  onRetry?: () => void;
}) {
  return <LiveStatus {...props} />;
}
