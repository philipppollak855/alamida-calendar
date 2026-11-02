import { isPublicWallPath } from '../config/publicWall';

export function isWallRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
  return pathname === '/wall' || pathname.startsWith('/wall/') || isPublicWallPath(pathname);
}
