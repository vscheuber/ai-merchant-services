export interface TenantConfig {
  tenantUrl: string;
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
  customAttributes?: Record<string, unknown>;
}

export interface AIAgentPayload extends OAuth2ClientPayload {
  aiAgentIdentityAttributes?: AIAgentIdentityAttributes;
}

export interface ApplicationPayload {
  _id?: string;
  name: string;
  description: string;
  templateName: string;
  templateVersion: string;
  ssoEntities: {
    oidcId: string;
  };
  [key: string]: unknown;
}

export interface TrustedJwtIssuerPayload {
  _id?: string;
  issuer: string;
  jwkSet?: Record<string, unknown>;
  jwksCacheTimeout: number;
  jwkStoreCacheMissCacheTime: number;
  jwksUri?: string;
  resourceOwnerIdentityClaim: string;
  [key: string]: unknown;
}

/** Stable, tenant-wide prefix used for payment-provider merchant groups. */
export interface MerchantGroupPrefixConfig {
  groupPrefix: string;
}

/** Merchant identities that are allowed to own payment-provider groups. */
export interface MerchantRegistryEntry {
  /** Canonical identifier persisted in custom_merchantId and group queries. */
  merchantId: string;
  /** Optional UI/resource identifier, such as mrch_northwind. */
  resourceId?: string;
  displayName: string;
}

/** Desired dynamic group in the payment-provider IDM realm. */
export interface MerchantGroupPayload {
  _id?: string;
  name: string;
  condition: string;
  [key: string]: unknown;
}

export interface MerchantGroupConfig extends MerchantGroupPrefixConfig {
  merchants: MerchantRegistryEntry[];
}

/** Desired payment-provider alpha_user fields used by merchant JIT. */
export interface PaymentUserPayload {
  userName: string;
  givenName: string;
  sn: string;
  mail: string;
  accountStatus: string;
  custom_merchantId: string;
  custom_merchantCustomerId: string;
  /** `_id` is intentionally omitted so IDM generates a UUID. */
  _id?: never;
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

export type ActionType =
  'created' | 'updated' | 'deleted' | 'verified' | 'skipped' | 'planned' | 'dry-run';
export type ActionOperation = 'create' | 'delete' | 'verify-404' | 'verify-identity' | 'replace';
export type ResourceType =
  | 'OAuth2Client'
  | 'OAuth2TrustedJwtIssuer'
  | 'AIAgent'
  | 'Application'
  | 'BravoUser'
  | 'MerchantGroup'
  | 'StaleApplication';

export interface ActionRecord {
  action: ActionType;
  resourceType: ResourceType;
  realm: string;
  id: string;
  operation?: ActionOperation;
  /** Managed alpha_aiagent identity ID; never a secret or credential. */
  identityId?: string;
  detail?: string;
  error?: string;
}

export interface RunSummary {
  timestamp: string;
  tenant: string;
  dryRun: boolean;
  actions: ActionRecord[];
}
