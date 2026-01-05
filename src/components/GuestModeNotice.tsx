type Props = {
  onLogin: () => void;
};

const GuestModeNotice = ({ onLogin }: Props) => (
  <div className="guest-mode">
    <p>
      You are exploring in guest mode. Preferences stay on this device only. Connect Google to
      sync across devices.
    </p>
    <button className="button is-small is-link" onClick={onLogin}>
      Continue with Google
    </button>
  </div>
);

export default GuestModeNotice;
