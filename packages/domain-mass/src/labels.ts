// Label renderer for MASS medication labels.
// TODO: domain-mass agent fills this in

export interface LabelRenderInput {
  readonly itemId: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export function renderLabel(_input: LabelRenderInput): string {
  return "";
}
