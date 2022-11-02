const core = require('@actions/core');
const github = require('@actions/github');

const repoOwner = core.getInput('repoOwner');
const repoName = core.getInput('repoName');
const prNumber = core.getInput('prNumber');
const checkNames = core.getMultilineInput('checkNames');

const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

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
