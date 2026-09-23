export interface ServiceDependencies {
  readonly repositories: Record<string, unknown>;
}

export abstract class Service {
  protected constructor(protected readonly dependencies: ServiceDependencies) {}
}
