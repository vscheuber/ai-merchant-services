/**
 * Identity records mirrored from the two IDP realms on the AIC tenant.
 *
 * `MerchantIdentity` mirrors the shape of a `merchant-provider managed user` — the
 * merchant-side realm holds the shopper's authoritative account. Seed data
 * in `data/users.json` populates this shape.
 *
 * `PaymentIdentity` mirrors the shape of a `payment-provider managed user` — the
 * payment-side realm. The scaffold does not seed payment identities; the
 * follow-on JIT-provisioning task will create them on first token exchange,
 * so the type exists here to lock in the shape for downstream tasks.
 */
export interface MerchantIdentity {
  /** Stable synthetic id, e.g. `user_ada`. Corresponds to `merchant-provider managed user._id`. */
  id: string;
  /** Login/user name. */
  userName: string;
  /** Primary email. */
  email: string;
  /** Given name. */
  givenName: string;
  /** Surname (mirrors AIC's `sn`). */
  sn: string;
  /** Merchant resource/UI identifier, such as `mrch_northwind`. */
  merchantId: string;
  /** Canonical merchant registry identifier used by payment-provider scoping. */
  merchantRegistryId?: string;
}

export interface PaymentIdentity {
  /** IDM-generated UUID for the payment-provider managed user `_id`. */
  id: string;
  /** IDM userName UUID, generated independently from the merchant subject. */
  userName: string;
  /** Primary email. */
  email: string;
  /** Given name. */
  givenName: string;
  /** Surname. */
  sn: string;
  /** Canonical merchant registry identifier, such as `northwind`. */
  merchantId: string;
  /** Stable customer subject from the originating merchant IDP. */
  merchantCustomerId: string;
  /**
   * Marker for observability: which realm's JIT flow provisioned this
   * payment identity. Left optional so hand-created records stay clean.
   */
  provisioningSource?: 'merchant-jit';
}
