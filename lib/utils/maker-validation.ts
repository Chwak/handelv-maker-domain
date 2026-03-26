/**
 * Validation helpers for Maker Domain GraphQL lambdas.
 * Aligned with patterns from other domains (product, order, review, etc.)
 */

export function validateId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

export function validateLimit(raw: unknown, defaultValue = 20, max = 100): number {
  if (raw == null) return defaultValue;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1) return defaultValue;
  return Math.min(n, max);
}

export function parseNextToken(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function encodeNextToken(key?: Record<string, unknown> | null): string | null {
  if (!key || Object.keys(key).length === 0) return null;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

type ActiveMode = 'maker' | 'collector';
type RequiredMode = ActiveMode | 'both';
const REQUIRED_ACTIVE_MODE: RequiredMode = 'maker';

function isEnabled(value: unknown): boolean {
  return value === true || value === 'true';
}

function resolveActiveMode(claims: Record<string, unknown> | undefined): ActiveMode | null {
  const rawMode = claims?.active_mode;
  if (rawMode === 'maker' || rawMode === 'collector') return rawMode;
  const makerEnabled = isEnabled(claims?.maker_enabled);
  const collectorEnabled = isEnabled(claims?.collector_enabled);
  if (makerEnabled !== collectorEnabled) return makerEnabled ? 'maker' : 'collector';
  // In maker domain, prefer maker when both are enabled but no active_mode is set.
  if (makerEnabled && collectorEnabled) return 'maker';
  return null;
}

function isAuthorizedForMode(claims: Record<string, unknown> | undefined, required: RequiredMode): boolean {
  const activeMode = resolveActiveMode(claims);
  if (required === 'both') return activeMode !== null;
  return activeMode === required;
}

export function requireAuthenticatedUser(
  event: { identity?: { sub?: string; claims?: { sub?: string } } },
  requiredMode: RequiredMode = REQUIRED_ACTIVE_MODE,
): string | null {
  const identity = event?.identity;
  if (!identity) return null;
  const claims = identity.claims as Record<string, unknown> | undefined;
  if (!isAuthorizedForMode(claims, requiredMode)) return null;
  if (typeof identity.sub === 'string' && identity.sub.trim()) return identity.sub.trim();
  if (identity.claims?.sub && typeof identity.claims.sub === 'string') return identity.claims.sub.trim();
  return null;
}

/**
 * Filter sensitive data from maker profile for public access.
 * Removes fields like taxId, phone, email that should not be public.
 */
export function filterPublicProfileData(profile: Record<string, unknown>): Record<string, unknown> {
  if (!profile) return {};
  const location = profile.location as Record<string, unknown> | undefined;
  const publicLocation = location
    ? {
        country: location.country,
        state: location.state,
        city: location.city,
        zipCode: location.zipCode ?? null,
        timezone: location.timezone ?? 'UTC',
      }
    : undefined;

  const numberOrZero = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

  const createdAt = typeof profile.createdAt === 'string' ? profile.createdAt : new Date(0).toISOString();
  const updatedAt = typeof profile.updatedAt === 'string' ? profile.updatedAt : createdAt;

  return {
    userId: profile.userId,
    email: profile.publicEmail ?? profile.email ?? '',
    username: profile.username,
    fullName: profile.fullName,
    givenName: profile.givenName,
    familyName: profile.familyName,
    phoneNumber: profile.publicPhoneNumber ?? null,
    displayName: profile.displayName,
    businessName: profile.businessName ?? profile.storeName,
    storeDescription: profile.storeDescription,
    bio: profile.bio,
    serviceAreas: profile.serviceAreas,
    businessType: profile.businessType ?? null,
    taxId: null,
    location: publicLocation,
    profileImageUrl: profile.profileImageUrl,
    profileImageStatus: profile.profileImageStatus,
    profileImageUpdatedAt: profile.profileImageUpdatedAt,
    bannerImageUrl: profile.bannerImageUrl,
    bannerImageStatus: profile.bannerImageStatus,
    bannerImageUpdatedAt: profile.bannerImageUpdatedAt,
    primaryCraft: profile.primaryCraft,
    yearsOfExperience: profile.yearsOfExperience,
    craftHeritage: profile.craftHeritage,
    publicEmail: profile.publicEmail,
    publicPhoneNumber: profile.publicPhoneNumber,
    websiteUrl: profile.websiteUrl,
    instagramUrl: profile.instagramUrl,
    tiktokUrl: profile.tiktokUrl,
    facebookUrl: profile.facebookUrl,
    shippingPolicy: profile.shippingPolicy,
    customOrderPolicy: profile.customOrderPolicy,
    cancellationPolicy: profile.cancellationPolicy,
    publicProfileEnabled: profile.publicProfileEnabled,
    phoneVerified: Boolean(profile.phoneVerified),
    phoneVerifiedAt: profile.phoneVerifiedAt ?? null,
    identityVerificationStatus: profile.identityVerificationStatus ?? 'UNVERIFIED',
    emailVerified: Boolean(profile.emailVerified),
    emailVerifiedAt: profile.emailVerifiedAt ?? null,
    totalShelfItems: numberOrZero(profile.totalShelfItems ?? profile.totalProducts),
    activeShelfItems: numberOrZero(profile.activeShelfItems ?? profile.activeProducts),
    soldShelfItems: numberOrZero(profile.soldShelfItems ?? profile.soldProducts),
    totalSales: numberOrZero(profile.totalSales),
    totalReviews: numberOrZero(profile.totalReviews),
    averageRating: profile.averageRating,
    acceptCustomOrders: Boolean(profile.acceptCustomOrders),
    acceptRushOrders: Boolean(profile.acceptRushOrders),
    isActive: profile.isActive !== false,
    isSuspended: Boolean(profile.isSuspended),
    suspendedReason: profile.suspendedReason ?? null,
    onboardingComplete: profile.onboardingComplete ?? null,
    lastLoginAt: profile.lastLoginAt ?? null,
    marketingOptInAt: profile.marketingOptInAt ?? null,
    termsAcceptedAt: profile.termsAcceptedAt ?? null,
    privacyPolicyAcceptedAt: profile.privacyPolicyAcceptedAt ?? null,
    createdAt,
    updatedAt,
  };
}

/**
 * Validate timezone format (basic IANA check).
 * Examples: 'America/New_York', 'Europe/London', 'Asia/Tokyo'
 */
export function validateTimezone(tz: unknown): string | null {
  if (typeof tz !== 'string') return null;
  const trimmed = tz.trim();
  // Basic validation: must contain '/' for continent/city format
  if (!trimmed.includes('/') || trimmed.length > 50) return null;
  return trimmed;
}
