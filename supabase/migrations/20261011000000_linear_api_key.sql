-- freenotes: a per-user Linear personal API key, stored encrypted like the model key.
alter table public.user_settings
  add column if not exists linear_api_key_ciphertext text,
  add column if not exists linear_api_key_last4 text;
