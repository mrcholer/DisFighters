import { Wordmark } from "@/components/game-ui";
export default function AuthLoading() {
  return <main role="status" className="activity-status"><Wordmark large /><span className="micro-label accent">CONNECTING TO DISCORD</span><p>Getting your fighter ready…</p></main>;
}
