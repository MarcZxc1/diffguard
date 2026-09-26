export type GithubRepositoryPermissions = {
  admin?: boolean;
  maintain?: boolean;
  push?: boolean;
  triage?: boolean;
  pull?: boolean;
};

export function canConnectRepository(
  permissions: GithubRepositoryPermissions | null | undefined,
) {
  return Boolean(permissions?.admin || permissions?.maintain);
}

export function githubPermissionLabel(
  permissions: GithubRepositoryPermissions | null | undefined,
) {
  if (permissions?.admin) return "admin";
  if (permissions?.maintain) return "maintain";
  if (permissions?.push) return "write";
  if (permissions?.triage) return "triage";
  if (permissions?.pull) return "read";
  return "none";
}
