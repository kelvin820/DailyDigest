# First actual NVIDIA comparison

Developer-only comparison; family accounts remain deferred by the user.
Private result: https://dayday-digest-demo.kelvin820.chatgpt.site/nemotron/

Successful run: https://github.com/kelvin820/DailyDigest/actions/runs/44309609059
Model: nvidia/nemotron-3.5-lightning-30b-a3b
Generated: 2026-11-18 21:02:24 Asia/Taipei.

| Edition | Body words | Word/sentence/vocabulary checks | Model review |
|---|---:|---|---|
| A1 / Elementary | 41 | Pass | Pass |
| A2 / Junior | 61 | Pass | Pass |
| B1 / Senior | 111 | Pass | Pass |

This run used 7 model requests/responses, 10300 input and 1090 output tokens.
All seven responses include usage; no usage_unknown entries in this run.
Pricing remains unknown (cost_unknown), so no zero-cost or dollar estimate is claimed.

The input is one DayDay-owned fictional scenario at three reading levels.
This is NOT a current-news issue, eight-story issue, PDF validation, database write,
publication, or family trial. report.json preserves those distinctions:
comparisonGenerated=true; apiGenerationSucceeded=false (full-issue check);
pdfVerified=false; databaseWritten=false; published=false.

The model reviewer missed a Chinese glossary mistranslation in Junior:
crayons was rendered 蠔粉. The display copy corrects it to 蠟筆 and labels this
change. Original checkpoints.json/report.json remain unchanged;
developer-corrections.json records the before/after and source run.
Automated review is therefore not equivalent to human editorial acceptance.
The reviewer prompt now explicitly checks glossary definitions and Chinese meanings.

Earlier debugging runs are separate from this comparison:

- 44305591652 and 44305959405 stopped at missing-secret preflight, no model call.
- 44306426113 made one attempt to the retired Nano endpoint and received HTTP 410;
  no usage returned and no draft generated.
- 44307535575 received 4 actual Lightning responses (5537 input / 1176 output tokens),
  then stopped on structured-output validation; one partial draft was preserved.
- 44308935880 was cancelled during browser dependency setup; generation was skipped.

Artifacts were retrieved through the GitHub connector's workflow artifact download,
then the returned Sediment file ID; direct Azure artifact redirects were inaccessible
from the cloud shell. This is a file-transfer limitation, not a failed NVIDIA call.

Local display verification: actual text versus DOM at 375/768/1440 for all three
editions; no overflow or browser errors. Evidence: output/nvidia-live-review/verification.json.
