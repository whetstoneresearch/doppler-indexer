export interface SanitizedErrorMetadata {
  name: string;
  message: string;
}

const URL_PATTERN = /https?:\/\/\S+/g;

function sanitizeErrorMessage(message: string): string {
  return message.replace(URL_PATTERN, "[redacted-url]");
}

export function sanitizeErrorMetadata(error: unknown): SanitizedErrorMetadata {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeErrorMessage(error.message),
    };
  }

  return {
    name: typeof error,
    message: "Non-Error thrown",
  };
}
