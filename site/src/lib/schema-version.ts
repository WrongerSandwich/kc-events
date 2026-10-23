/**
 * The shape of the public events.json; bumped by hand when a field is removed or changes meaning. It starts at 2
 * because the job's raw file, version 1, was served at the same URL until #89. Here, not in the build, so llms.txt can
 * name it without importing the dataset loader (#188).
 */
export const PUBLISHED_SCHEMA_VERSION = 2;
