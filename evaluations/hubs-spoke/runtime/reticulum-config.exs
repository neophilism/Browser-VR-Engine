# Appended only to the exact pinned development build context. This is a
# loopback diagnostic profile, not a production authentication policy.
if config_env() == :dev do
  config :ret, Ret.Repo, password: "synthetic-local-only"
  config :ret, Ret.SessionLockRepo, password: "synthetic-local-only"
  config :ret, Ret.Locking,
    session_lock_db: [database: "ret_dev", hostname: System.fetch_env!("DB_HOST"),
                      password: "synthetic-local-only", username: "postgres"]
  config :ret, RetWeb.Endpoint,
    https: [port: 4000, keyfile: "/run/bve/key.pem", certfile: "/run/bve/cert.pem"],
    secret_key_base: File.read!("/run/bve/secret-base"),
    code_reloader: false,
    allowed_origins: "https://hubs.local:4000,https://hubs.local:8080"
  config :ret, Ret.PermsToken, perms_key: File.read!("/run/bve/perms-private.pem")
  config :ret, Ret.Guardian, secret_key: File.read!("/run/bve/guardian-secret")
  # The partial runtime does not start Admin or Spoke. This disables the warmer's
  # aggregate background fetch; dev skip_cache still fetches real Hubs pages on demand.
  config :ret, Ret.PageOriginWarmer, admin_page_origin: nil, spoke_page_origin: nil
  config :cors_plug, origin: ["https://hubs.local:4000", "https://hubs.local:8080"]
end
