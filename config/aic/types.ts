export interface TenantConfig {
  tenantUrl: string;
  adminServiceAccountEnv: string;
  adminServiceAccountKeyEnv: string;
}

// frodo_read returns {inherited, value} wrappers — handle in flattenWrapped
export interface Wrapped<T> {
  inherited: boolean;
  value: T;
}

export type MaybeWrapped<T> = Wrapped<T> | T;

export interface CoreOAuth2ClientConfig {
  clientType?: string;
  status?: string;
  clientName?: string[];
  scopes?: string[];
  redirectionUris?: string[];
  refreshTokenLifetime?: number;
  accessTokenLifetime?: number;
  authorizationCodeLifetime?: number;
  userpassword?: string;
  [key: string]: unknown;
}

export interface AdvancedOAuth2ClientConfig {
  grantTypes?: string[];
  isConsentImplied?: boolean;
  responseTypes?: string[];
  tokenEndpointAuthMethod?: string;
  [key: string]: unknown;
}

export interface OAuth2ClientPayload {
  _id?: string;
  coreOAuth2ClientConfig?: CoreOAuth2ClientConfig;
  advancedOAuth2ClientConfig?: AdvancedOAuth2ClientConfig;
  [key: string]: unknown;
}

export interface AIAgentIdentityAttributes {
  name: string;
  description: string;
  customAttributes: null | Record<string, unknown>;
}

export interface AIAgentPayload extends OAuth2ClientPayload {
  aiAgentIdentityAttributes?: AIAgentIdentityAttributes;
}

export interface TrustedJwtIssuerPayload {
  _id?: string;
  issuer: string;
  jwkSet: null;
  jwksCacheTimeout: number;
  jwkStoreCacheMissCacheTime: number;
  jwksUri: string;
  resourceOwnerIdentity: string;
  trustedIssuerClaims: string[];
  claimsToUserMapping: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Represents a `managed/bravo_user` object in the AIC bravo realm.
 * Mirrors the `MerchantIdentity` shape from `@acme/shared`.
 */
export interface BravoUser {
  /** Stable synthetic id, e.g. `user_ada`. Used as the managed object `_id`. */
  id: string;
  /** Login/user name. */
  userName: string;
  /** Primary email. */
  email: string;
  /** Given name. */
  givenName: string;
  /** Surname (maps to AIC's `sn` field). */
  sn: string;
  /** Merchant this account belongs to. */
  merchantId: string;
}

export type ActionType = 'created' | 'updated' | 'skipped' | 'dry-run';
export type ResourceType = 'OAuth2Client' | 'OAuth2TrustedJwtIssuer' | 'AIAgent' | 'BravoUser';

export interface ActionRecord {
  action: ActionType;
  resourceType: ResourceType;
  realm: string;
  id: string;
  error?: string;
}

export interface RunSummary {
  timestamp: string;
  tenant: string;
  dryRun: boolean;
  actions: ActionRecord[];
}
