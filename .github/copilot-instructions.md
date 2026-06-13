After making code changes in this repository, run `./build_and_deploy.sh` so the updated plugin is built and copied into the test vault.
If the `build_and_deploy.sh` script fails, notify the user that obsidian is likely running and preventing the files from being copied, and suggest closing obsidian and trying again.
If the task only changes documentation or repository metadata, deploying is not required.

When changes are made to the plugin's functionality, also update the "Unreleased" section of the `CHANGELOG.md` file with a summary of the changes, categorized by "Added", "Changed", and "Fixed". If the changes are significant enough to warrant a new release, create a new section in the changelog with the version number and date, and move the relevant changes from the "Unreleased" section to the new version section.

The versioning strategy for the application follows semantic versioning. Increment the major version for breaking changes, the minor version for new features that are backward compatible, and the patch version for backward-compatible bug fixes.