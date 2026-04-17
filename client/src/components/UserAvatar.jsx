import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser } from '@fortawesome/free-solid-svg-icons';

const SIZES = {
  xs: { dim: 'h-5 w-5', icon: 'h-3 w-3' },
  sm: { dim: 'h-6 w-6', icon: 'h-3.5 w-3.5' },
  md: { dim: 'h-8 w-8', icon: 'h-4 w-4' },
};

export function UserAvatar({ userId, avatarUrl, size = 'sm' }) {
  const [error, setError] = useState(false);
  const { dim, icon } = SIZES[size] || SIZES.sm;
  const src = avatarUrl || (userId ? `/api/user/avatar/${userId}` : null);

  return (
    <div className={`${dim} rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0`}>
      {src && !error ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setError(true)} />
      ) : (
        <FontAwesomeIcon icon={faUser} className={icon} />
      )}
    </div>
  );
}
