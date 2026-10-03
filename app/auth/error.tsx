import { GameIcon, Wordmark } from "@/components/game-ui";
export default function AuthError({ error, reset }: { readonly error: Error; readonly reset: () => void }) {
  return <main role="alert" className="activity-status activity-error"><Wordmark large /><div className="auth-message"><span className="micro-label accent">YOUR RIVALRY STARTS IN DISCORD</span><h1>DISCORD SIGN-IN<br />REQUIRED.</h1><p>Open DisFighters from Discord to join a real-time duel.</p><p className="controls-note">{error.message}</p><button className="primary-button" type="button" onClick={reset}>TRY AGAIN<GameIcon name="arrow" /></button></div></main>;
}
