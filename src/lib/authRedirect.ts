export const CANONICAL_APP_ORIGIN = "https://terntripsindia.in";
export const CANONICAL_APP_ROOT = `${CANONICAL_APP_ORIGIN}/`;

export const isCanonicalAppHost = () => {
  const hostname = window.location.hostname.toLowerCase();
  return hostname === "terntripsindia.in";
};

export const getCanonicalAuthRedirectUrl = () => CANONICAL_APP_ROOT;

export const getCanonicalHashRouteUrl = (route: string) => {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${CANONICAL_APP_ROOT}#${normalizedRoute}`;
};

export const getCanonicalCallbackUrl = () =>
  `${CANONICAL_APP_ROOT}${window.location.search}${window.location.hash}`;