// Errors whose message text is always safe to print verbatim to the user:
// never contains a raw key value, only source names, rule descriptions or file paths.
export class CliError extends Error {}
