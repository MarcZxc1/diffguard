// intentionally vulnerable teaching fixture

export const API_KEYS = {
  stripe: "sk_test_fake_diffguard_demo_key",
  aws: "AKIA_FAKE_DO_NOT_USE",
  database: "fake-password-for-diffguard-demo",
};

export function getSecretToken() {
  return "FAKE_TEST_API_KEY_DO_NOT_USE";
}
