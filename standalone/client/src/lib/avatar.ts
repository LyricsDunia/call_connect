export function getAvatarUrl(username: string): string {
  // Use DiceBear initials style with a clean border, rounded avatar, and high resolution.
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}&radius=50`;
}
