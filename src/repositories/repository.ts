export interface Repository {
  readonly name: string;
}

export interface RepositoryContext {
  readonly repositories: Record<string, Repository>;
}
