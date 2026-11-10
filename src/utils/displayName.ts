/** Anything that can name a person: an auth user or a household member. */
export interface NamedUser {
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
}

/** Longest display name the server accepts (PATCH /auth/me). */
export const DISPLAY_NAME_MAX_LENGTH = 64;

/** The user's display name, if they set one (blank counts as unset). */
export const displayNameOnly = (user: NamedUser | null | undefined): string | null => {
  const name = user?.display_name?.trim();
  return name ? name : null;
};

/**
 * How to show a person: their display name, else their username, else their
 * email. `display_name` is optional on the wire — older servers don't send it.
 */
export const displayNameOf = (user: NamedUser | null | undefined): string =>
  displayNameOnly(user) || user?.username || user?.email || '';

/**
 * Secondary line under a person's name. With a display name set it shows the
 * username (and email) so the account is still identifiable; otherwise the
 * username is already the title and only the email is left.
 */
export const secondaryNameLine = (user: NamedUser | null | undefined): string => {
  if (!user) return '';
  if (displayNameOnly(user) && user.username) {
    return user.email ? `${user.username} · ${user.email}` : user.username;
  }
  return user.username ? user.email ?? '' : '';
};
