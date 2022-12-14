# automerge-pr-action

This action polls for required checks within a branch, waits for successful completion, and automatically merges a pull request.

It grabs required check names from your branch protection rules via query of GitHub's API, polls until they are complete, and merges if they are successful.

If there are no required checks - as long as there are no merge conflicts, the PR can be merged successfully.

### Inputs

| Name       | Description                                                                       | Required | Default     |
|:-----------|:----------------------------------------------------------------------------------|:--------:|:-----------:|
| repoOwner  | The owner of the repository with the PR you wish to automatically merge           | false    | `bandwidth` |
| repoName   | The name of the repo with the PR in question                                      | true     | N/A         |
| prNumber   | The PR number to automatically merge                                              | true     | N/A         |
| token      | GH user token with permission to merge PRs and read branch and checks information | true     | N/A         |
| maxRetries | The amount of times to retry requests for checks status (string)                  | false    | '10'        |
| retryDelay | Amount of time (in seconds) to wait between retries (string)                      | false    | '60'        |

### Example Usage

```yml
jobs:
  merge:
    if: ${{ github.event.action == 'Merge' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Set PR number as env variable
        run: |
          echo "PR_NUMBER=$(hub pr list -h ${{ github.event.client_payload.branchName }} -f %I)" >> $GITHUB_ENV

      - uses: bandwidth/automerge-pr-action@v1.0.0
        with:
          repoOwner: my-org-that-isnt-bandwidth
          repoName: my-cool-repo
          prNumber: ${{ env.PR_NUMBER }}
          token: ${{ secrets.MY_BOT_GH_USER_TOKEN }}
          maxRetries: '5'
          retryDelay: '30'

      - uses: actions/github-script@v6
        if: failure()
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: ${{ env.PR_NUMBER }},
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: 'Failed to auto-merge this PR. Check workflow logs for more information'
            })
```
