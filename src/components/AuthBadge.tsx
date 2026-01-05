type Props = {
  name?: string;
  email?: string;
  mode: 'guest' | 'google';
  onLogin: () => void;
  onLogout: () => void;
};

const AuthBadge = ({ name, email, mode, onLogin, onLogout }: Props) => (
  <div className="auth-badge">
    {mode === 'guest' ? (
      <>
        <span>Guest Session</span>
        <button className="button is-light is-small" onClick={onLogin}>
          Sign in with Google
        </button>
      </>
    ) : (
      <>
        <div>
          <strong>{name ?? 'Shopper'}</strong>
          <span>{email}</span>
        </div>
        <button className="button is-light is-small" onClick={onLogout}>
          Logout
        </button>
      </>
    )}
  </div>
);

export default AuthBadge;
