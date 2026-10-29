# myq in the browser

Interface: https://pliploop.github.io/myq-web/

Private snapshot repository: https://github.com/Pliploop/myq-data

A static GitHub Pages dashboard and a one-shot Slurm snapshot exporter. No cluster web server or personal daemon. No dependencies beyond Python 3, Git, Slurm tools, and a scheduler.

## Try locally

Open dist/index.html in a browser and click Explore demo. No server is required.
To view real data, run on the cluster:

    python3 snapshot.py --output .local/snapshot.json

Copy that JSON to your laptop and choose Open snapshot. Actual snapshots are private working data and are excluded from Git by .gitignore.

Light mode is the default. The Dark / Light control remembers only your theme preference in browser storage. The interface uses flat surfaces, square controls, and thin rules.\n\nThe dashboard supports searching, state filters, job details, stdout/stderr selection, copying logs, and snapshot age/staleness. CPU/GPU counts are allocations. GPU peak activity and GPU memory are Slurm task high-water marks from one batched sstat query per snapshot, not instantaneous utilization. Missing accounting is displayed as unavailable, never as zero. A snapshot cannot deliver live log streaming.

## Scheduled operation

Use two repositories:
1. An interface repository containing this project; publish only dist/ to GitHub Pages.
2. A dedicated PRIVATE data repository containing snapshot.json.

Open the interface and choose Connect. The data repository is prefilled. Use the Create a read-only token link, select Only select repositories → myq-data, retain Contents: read, generate the token and paste it into the connection form. Do not send the token through chat.

The browser reads the private data repository using a fine-grained GitHub token with Contents: read. It keeps that token only in page memory and sends it only to api.github.com. Reloading disconnects. No SSH credentials enter the browser. Do not put real snapshots in dist/ or publish them via a public Pages artifact.

A separate write credential scoped to the data repository is needed by whichever machine publishes snapshots. Configure that credential using Git's usual SSH or credential-helper support; never commit it.

### Short scheduled task on an approved login node

This avoids inbound automated SSH authentication entirely. System cron starts an exporter periodically; it captures data, pushes one file, and exits. There is no sleeping loop or user process between snapshots.

The prepared data checkout is /data/home/acw749/myq-data. From an Apocrita login node, install the schedule with:

    bash /data/home/acw749/myq-web/install_schedule.sh

The installer refuses compute nodes, tests a complete snapshot publication before installing cron, preserves a backup of the existing crontab, and replaces only its own marked entry. To remove it later, run install_schedule.sh --remove on the same host.

To run one publication manually:

    bash /data/home/acw749/myq-web/publish_snapshot.sh /absolute/path/to/private-data-checkout

Example crontab (not installed by this project):

    PATH=/opt/slurm/bin:/data/home/acw749/miniconda3/bin:/usr/bin:/bin
    2-59/5 * * * * /usr/bin/bash /data/home/acw749/myq-web/publish_snapshot.sh /absolute/path/to/private-data-checkout >> /data/home/acw749/myq-web/.local/publish.log 2>&1

Create .local/ first. Install cron only on the approved stable login host, not inside a temporary compute allocation. The script locks against overlaps and only commits snapshot.json. Each invocation is finite. The exporter keeps the last good snapshot when Slurm fails, and the page labels old data stale.

If cluster policy excludes scheduled user tasks, the alternative is a GitHub Actions schedule that SSHes in, runs snapshot.py once, and saves the result to the private data repository. GitHub schedules run at most every five minutes and may be delayed. Apocrita normally requires both an SSH key and account password; confirm a supported unattended authentication method before using this route. This project does not provision SSH credentials or an unattended login bypass.

## Publish the interface

Push the interface source to a GitHub repository and set Pages source to GitHub Actions. Run the included Publish dashboard interface workflow manually. It uploads only dist/, excluding actual snapshots and publisher state.

The website periodically checks GitHub for a newer snapshot while visible. This polling never contacts the cluster; only the scheduled exporter does. Data remains private even if the interface repository is public.

## Collection limits

- One squeue query and at most one sstat query per invocation; up to six running-job log lookups. GPU accounting covers up to 50 running GPU jobs.\n- GPU task high-water marks can exceed 100% for a task using multiple GPUs; values are preserved and labeled as peaks. Memory is converted from Slurm bytes to GiB in the interface.
- Each stdout/stderr tail reads at most 32 KiB; output retains 80 lines, each clipped to 500 characters.
- Recently departed jobs retain log tails for up to one day, capped at 20 jobs. LEFT_QUEUE is not a claim of success; final accounting state is not queried.
- Files are read without modifying jobs or logs. No Slurm control operations.
- The scheduler is installed separately by install_schedule.sh on the chosen login host.

Sources:
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://docs.hpc.qmul.ac.uk/intro/login/
