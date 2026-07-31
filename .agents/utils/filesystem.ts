import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';

export interface DirectoryEntry {
  readonly isDirectory: () => boolean;
  readonly name: string;
}

export interface FileSystem {
  readonly mkdir: (
    path: string,
    options: { readonly recursive: true },
  ) => Promise<string | undefined>;
  readonly readdir?: (
    path: string,
    options: { readonly withFileTypes: true },
  ) => Promise<readonly DirectoryEntry[]>;
  readonly readFile: (
    path: string,
    encoding: BufferEncoding,
  ) => Promise<string>;
  readonly rm: (
    path: string,
    options: { readonly force: true },
  ) => Promise<void>;
  readonly writeFile: (
    path: string,
    content: string,
    encoding: BufferEncoding,
  ) => Promise<void>;
}

export interface NodeFileSystemOperations {
  readonly mkdir: FileSystem['mkdir'];
  readonly readDirectory: FileSystem['readdir'];
  readonly readFile: FileSystem['readFile'];
  readonly rm: FileSystem['rm'];
  readonly writeFile: FileSystem['writeFile'];
}

export const createNodeFileSystem = (
  operations: NodeFileSystemOperations,
): FileSystem => ({
  mkdir: operations.mkdir,
  readdir: operations.readDirectory,
  readFile: operations.readFile,
  rm: operations.rm,
  writeFile: operations.writeFile,
});

export const nodeFileSystem = createNodeFileSystem({
  mkdir,
  readDirectory: readdir as NonNullable<FileSystem['readdir']>,
  readFile,
  rm,
  writeFile,
});

export const parentDirectory = (path: string): string => {
  const separator = path.lastIndexOf('/');
  if (separator === 0) {
    return '/';
  }
  if (separator < 0) {
    throw new Error(`An absolute file path is required: ${path}`);
  }
  return path.slice(0, separator);
};

export const readText = async (
  fileSystem: FileSystem,
  path: string,
): Promise<string> => fileSystem.readFile(path, 'utf8');

export const removeFile = async (
  fileSystem: FileSystem,
  path: string,
): Promise<void> => {
  await fileSystem.rm(path, { force: true });
};

export const writeText = async (
  fileSystem: FileSystem,
  path: string,
  content: string,
): Promise<void> => {
  await fileSystem.mkdir(parentDirectory(path), { recursive: true });
  await fileSystem.writeFile(path, content, 'utf8');
};
