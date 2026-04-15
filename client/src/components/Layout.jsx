import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImages, faUpload, faGear, faRightFromBracket, faUser, faTableCellsLarge, faChevronDown, faBoxOpen } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

function NavLink({ to, children, icon }) {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(to + '/');
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
      )}
    >
      {icon && <FontAwesomeIcon icon={icon} className="h-4 w-4" />}
      {children}
    </Link>
  );
}

function UserAvatar({ user, size = 'sm' }) {
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div className={`${dim} rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <FontAwesomeIcon icon={faUser} className={iconSize} />
      )}
    </div>
  );
}

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/auth/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-bold text-primary text-sm tracking-widest uppercase">sharely</Link>
            <Separator orientation="vertical" className="h-5" />
            <nav className="flex items-center gap-1">
              <NavLink to="/gallery" icon={faImages}>Gallery</NavLink>
              <NavLink to="/upload" icon={faUpload}>Upload</NavLink>
              {user?.role === 'admin' && (
                <NavLink to="/admin" icon={faTableCellsLarge}>Admin</NavLink>
              )}
            </nav>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <UserAvatar user={user} size="sm" />
                <span className="hidden sm:inline">{user?.username}</span>
                <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* User header */}
              <div className="flex items-center gap-3 px-2 py-2">
                <UserAvatar user={user} size="md" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{user?.username}</span>
                  <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
                </div>
              </div>
              <DropdownMenuSeparator />

              {/* Settings */}
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                  <FontAwesomeIcon icon={faGear} className="h-4 w-4" />Settings
                </Link>
              </DropdownMenuItem>

              {/* Admin section */}
              {user?.role === 'admin' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1">Admin</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/users" className="flex items-center gap-2 cursor-pointer">
                      <FontAwesomeIcon icon={faUser} className="h-4 w-4" />Users
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/import" className="flex items-center gap-2 cursor-pointer">
                      <FontAwesomeIcon icon={faBoxOpen} className="h-4 w-4" />Import XBackBone
                    </Link>
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive">
                <FontAwesomeIcon icon={faRightFromBracket} className="h-4 w-4" />Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground space-y-1">
        <div>
          Powered by{' '}
          <a
            href="https://github.com/Christianoooooo/sharely"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Christian
          </a>
        </div>
        <div>Licensed under the MIT License</div>
      </footer>
    </div>
  );
}
