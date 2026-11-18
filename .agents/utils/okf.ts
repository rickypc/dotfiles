import matter from 'gray-matter';

export interface OkfMetadata {
  readonly description: string;
  readonly tags: readonly string[];
  readonly title: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

const requiredFields: readonly (keyof OkfMetadata)[] = ['type', 'title', 'description', 'tags'];

const stringMetadata = (data: Record<string, unknown>, key: string): string => {
  const value = data[key];
  if (typeof value !== 'string') {
    throw new Error(`OKF metadata field is required: ${key}`);
  }
  return value;
};

export const validateOkfMetadata = (metadata: OkfMetadata): void => {
  for (const field of requiredFields) {
    const value = metadata[field];
    if (
      (typeof value === 'string' && !value.trim())
      || (Array.isArray(value) && value.length === 0)
    ) {
      throw new Error(`OKF metadata field is required: ${field}`);
    }
  }
};

export const parseOkfConcept = (content: string): OkfMetadata => {
  const parsed = matter(content);
  if (!matter.test(content) || content.indexOf('\n---', 4) < 0) {
    throw new Error('OKF concept frontmatter is required.');
  }
  const tagsValue = parsed.data.tags;
  if (!Array.isArray(tagsValue) || tagsValue.some((tag) => typeof tag !== 'string')) {
    throw new Error('OKF metadata field is required: tags');
  }
  const metadata: OkfMetadata = {
    ...parsed.data,
    description: stringMetadata(parsed.data, 'description'),
    tags: tagsValue as readonly string[],
    title: stringMetadata(parsed.data, 'title'),
    type: stringMetadata(parsed.data, 'type'),
  };
  validateOkfMetadata(metadata);
  return metadata;
};

export const renderOkfConcept = (metadata: OkfMetadata, body: string): string => {
  validateOkfMetadata(metadata);
  if (!body.trim()) {
    throw new Error('OKF concept body is required.');
  }
  return matter.stringify(body.trim(), metadata);
};
