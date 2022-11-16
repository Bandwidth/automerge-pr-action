const core = require('@actions/core');
const github = require('@actions/github');

const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;
const prNumber = process.env.PR_NUMBER;
const token = process.env.TOKEN;
const maxRetries = process.env.MAX_RETRIES
const delayBetweenRequests = process.env.DELAY_BETWEEN_REQUESTS

const octokit = github.getOctokit(token);

async function getCheckRunId(requiredCheckName){
    var checkId = null;

    const { data: checks } = await octokit.request('GET /repos/{repoOwner}/{repoName}/commits/{commitId}/check-runs', {
        repoOwner: repoOwner,
        repoName: repoName,
        commitId: commitId
    });  // this has to be queried each time since the payload changes as checks move from queued to in progress

    for (run in checks.check_runs){
        if (requiredCheckName.includes(checks.check_runs[run].name)){
            checkId = checks.check_runs[run].id;
        }
    }

    return checkId;
}

async function pollForChecks(requiredChecks){
    var checksStatus = [];
    var currentTry = 0;

    for (check in requiredChecks ){
        while ( currentTry <= maxRetries ){
            checkId = await getCheckRunId(requiredChecks[check].context);
            if (checkId == null){
                currentTry += 1;
                await new Promise(resolve => setTimeout(resolve, delayBetweenRequests*2000));
            } else {
                checksStatus.push({checkId: checkId, name: requiredChecks[check].context, result: null});
                break
            }
        }
    }

    if (requiredChecks.length != checksStatus.length){
        core.setFailed('Timed out waiting for required checks to complete. Cant Auto-Merge PR.');
        process.exit(1);
    }

    currentTry = 0    // reset currentTry since we need to poll again for completion
    for (check in checksStatus){
        while (currentTry <= maxRetries){
            run = await octokit.rest.checks.get({
                owner: repoOwner,
                repo: repoName,
                check_run_id: checksStatus[check].checkId,
            });
            if (run.data.status == 'completed'){
                checksStatus[check].result = {status: run.data.status, conclusion: run.data.conclusion};
                break;
            }
            currentTry += 1;
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequests*1000));    // setTimeout(functionRef, delay) sets delay in ms
        }
    }

    if (requiredChecks.length != checksStatus.length){
        core.setFailed('Timed out waiting for required checks to complete. Cant Auto-Merge PR.');
        process.exit(1);
    }

    return checksStatus;
}

async function main() {

    const { data: pullRequest } = await octokit.rest.pulls.get({
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
    });

    if (pullRequest.mergeable != true){
        core.setFailed('Merge Conflicts Present. Cant Auto-Merge PR.');
        process.exit(1);
    }

    const { data: branch } = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
        owner: repoOwner,
        repo: repoName,
        branch: 'main'
    })
    requiredChecks = branch.protection.required_status_checks.checks;

    if (requiredChecks.length) {
        global.commitId = pullRequest.head.sha;

        const checksStatusList = await pollForChecks(requiredChecks);

        for (check in checksStatusList){
            if (checksStatusList[check].result.conclusion != 'success'){
                core.setFailed(checksStatusList[check].name + '(ID: ' + checksStatusList[check].checkId + ')' + ' failed. Can\'t auto-merge PR');
                process.exit(1);
            }
        }
    }

    // try{
    //     await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
    //         owner: repoOwner,
    //         repo: repoName,
    //         pull_number: prNumber,
    //         commit_title: 'Auto-merge PR based on merge event',
    //         commit_message: 'Auto-merging PR based on merge event from upstream repository'
    //     })
    // } catch (error) {
    //     core.setFailed('Auto-merge criteria was met, but API call to merge PR failed:\n', error);
    //     process.exit(1);
    // }
}

main();
