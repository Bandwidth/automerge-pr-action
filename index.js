const core = require("@actions/core");
const github = require("@actions/github");

const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;
const prNumber = process.env.PR_NUMBER;
const token = process.env.TOKEN;
const maxRetries = Number(process.env.MAX_RETRIES);
const retryDelay = Number(process.env.RETRY_DELAY);

const octokit = github.getOctokit(token);

/**
 * getCheckRunId Returns the GitHub Check ID given a check name
 * @param {string} requiredCheckName
 * @returns {int} Unique Check ID
 */
async function getCheckRunId(requiredCheckName) {
  var checkId = null;

  const { data: checks } = await octokit.request(
    "GET /repos/{repoOwner}/{repoName}/commits/{commitId}/check-runs",
    {
      repoOwner: repoOwner,
      repoName: repoName,
      commitId: commitId,
    }
  );

  for (run in checks.check_runs) {
    if (requiredCheckName.includes(checks.check_runs[run].name)) {
      checkId = checks.check_runs[run].id;
    }
  }

  return checkId;
}

/**
 * pollForChecks Polls the GitHub API For checks status
 * @param {object} requiredChecks
 * @returns {array} An array of status objects, with a checkId, name, and result property. `result` has status and conclusion properties, both strings.
 */
async function pollForChecks(requiredChecks) {
  var checksStatus = [];
  var currentTry = 0;

  // Poll for checkIds. GitHub does not create an ID for checks until they have started
  // Enqueued checks do not receive an ID, so unfortunately we must poll to get an ID for the
  // required checks we previously grabbed from the branch protection rules
  for (check in requiredChecks) {
    while (currentTry <= maxRetries) {
      checkId = await getCheckRunId(requiredChecks[check].context);
      if (checkId == null) {
        currentTry += 1;
        await new Promise(
          (resolve) => setTimeout(resolve, retryDelay * 1000) // Convert ms to seconds
        );
      } else {
        currentTry = 0;
        checksStatus.push({
          checkId: checkId,
          name: requiredChecks[check].context,
          result: null,
        });
        break;
      }
    }
  }

  if (requiredChecks.length != checksStatus.length) {
    core.setFailed(
      "Timed out waiting for required checks to complete. Cant Auto-Merge PR."
    );
    process.exit(1);
  }

  // Poll for completed status on all of the required checks
  // Resets currentTry since we need to poll again for completion
  currentTry = 0;
  for (check in checksStatus) {
    while (currentTry <= maxRetries) {
      run = await octokit.rest.checks.get({
        owner: repoOwner,
        repo: repoName,
        check_run_id: checksStatus[check].checkId,
      });
      if (run.data.status == "completed") {
        currentTry = 0;
        checksStatus[check].result = {
          status: run.data.status,
          conclusion: run.data.conclusion,
        };
        break;
      }
      currentTry += 1;
      await new Promise(
        (resolve) => setTimeout(resolve, retryDelay * 1000) // Convert ms to seconds
      );
    }
  }

  return checksStatus;
}

/**
 * main contains all of the logic to gather required PR check information, poll for complete + successful status
 * and then merge a PR contingent on required checks completing successfully.
 */
async function main() {
  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner: repoOwner,
    repo: repoName,
    pull_number: prNumber,
  });

  if (pullRequest.mergeable != true) {
    core.setFailed("Merge Conflicts Present. Cant Auto-Merge PR.");
    process.exit(1);
  }

  const { data: branch } = await octokit.request(
    "GET /repos/{owner}/{repo}/branches/{branch}",
    {
      owner: repoOwner,
      repo: repoName,
      branch: "main",
    }
  );

  requiredChecks = branch.protection.required_status_checks.checks;
  // Remove the SDLC check from the list since it never shows up in the /check-runs API
  for (check in requiredChecks) {
    if ((requiredChecks[check].context = "SDLC Enforcer")) {
      requiredChecks.splice(check, 1);
    }
  }
  if (requiredChecks.length) {
    global.commitId = pullRequest.head.sha;
    const checksStatusList = await pollForChecks(requiredChecks);

    // Check to ensure that each check completed with a successful result
    for (check in checksStatusList) {
      if (checksStatusList[check].result.conclusion != "success") {
        core.setFailed(
          checksStatusList[check].name +
            "(ID: " +
            checksStatusList[check].checkId +
            ")" +
            " failed. Can't auto-merge PR"
        );
        process.exit(1);
      }
    }
  }

  // Attempt to merge the PR given all criteria was met
  try {
    await octokit.request(
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
      {
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
        commit_title: "Auto-merge PR based on merge event",
        commit_message:
          "Auto-merging PR based on merge event from upstream repository",
      }
    );
  } catch (error) {
    core.setFailed(
      "Auto-merge criteria was met, but API call to merge PR failed:\n",
      error
    );
    process.exit(1);
  }
}

main();
