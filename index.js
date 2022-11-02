const core = require('@actions/core');
const github = require('@actions/github');

const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;
const prNumber = process.env.PR_NUMBER;
const checkNames = process.env.CHECK_NAMES;
const token = process.env.TOKEN;

const octokit = github.getOctokit(token);

async function main() {
    //TODO: Check for checks test status
    //TODO: Merge PR
    const { data: pullRequest } = await octokit.rest.pulls.get({
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
    });

    // Checks for merge conflicts
    if (pullRequest.mergeable != true){
        core.setFailed('Merge Conflicts Present. Cant Auto-Merge PR.');
    }

    // Poll for checks status
    if (checkNames) {
        const commitId = pullRequest.head.sha;

        const { data: checks } = await octokit.request('GET /repos/{repoOwner}/{repoName}/commits/{commitId}/check-runs', {
            repoOwner: repoOwner,
            repoName: repoName,
            commitId: commitId
        });

        // console.log(pullRequest);
        console.log(checkNames);
    }
}

main();
