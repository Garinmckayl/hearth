# Cloud Vega simulator host

Provisioned October 13, 2026 in `us-east-1` for official simulator testing.

## Bounded smoke-test session — October 16

The user authorized a replacement simulator session after reviewing its cost and cleanup bounds. A cheaper Apple M1 host (`mac2.metal`) was allocated in `us-east-1a`: `h-07fdfc2fc8459d6ed`. AWS Price List API verified $0.65 per host-hour, with a 24-hour minimum of $15.60 before EBS, IPv4, service usage, and taxes. Credit eligibility has not been verified.

The initial attempt ended before its **October 16 at 22:53 UTC** deadline without completing startup. After the user requested continuing on October 17, the existing host was reused within its original 24-hour minimum allocation. The new instance `i-05bfd2108fa0ca654` must terminate by **October 17 at 04:55 UTC**; a new enabled EventBridge schedule targets that exact instance, and refreshed boot user data supplies a local shutdown fallback. No additional dedicated host was allocated. The host-release schedule still requests release every fifteen minutes after **October 17 at 16:56 UTC**, through **October 18 at 04:53 UTC**. These schedules are safeguards, not a guaranteed monetary cap; confirm the dedicated host reaches `released`.

The first instance request failed with `Server.InsufficientInstanceCapacity` while the allocated dedicated host was still `pending`. The retry waits for that same host to become `available`; no second host is allocated. Exact current resource IDs and cleanup schedule names are in `artifacts/simulator-session-20261016.json`. Simulator execution is not yet verified for this session.

## Current proof and automated simulator check

The current browser smoke check passed with synthetic microphone input, real Nova Sonic inference, a dance action and browser acknowledgment, microphone pause, and conversation end. The 24.96-second MP4 is available at https://synthetic-searched-strength-displaying.trycloudflare.com/hearth-browser-smoke.mp4. Public playback was verified in Chromium at 1920×1080. This is browser evidence; it does not verify the official simulator or cross-app TV playback.

The public page at https://synthetic-searched-strength-displaying.trycloudflare.com now shows the 54-second movie-night browser check and polls simulator status. A local background worker launches only the existing host's session instance, installs the pinned official SDK, verifies the ARM package, pairs a browser phone using the actual simulator QR, and starts an actual open film, requests native media discovery, and checks a spoken movie pause plus the simulator player's acknowledgment. On success it publishes native simulator video to the same page and requests early instance termination. On failure it publishes the blocked stage and retains the instance for diagnosis until its scheduled shutdown. The renewed instance deadline and original host-release schedule remain in force. The page and tunnels depend on this workspace's running processes.

The new instance failed reachability checks before SSM registered. One recovery reboot was requested. AWS host recovery was then enabled after checking the current AWS documentation: Mac2 is supported and AWS lists no additional recovery fee, although usual host billing still applies. A separate watcher follows any replacement host ID and updates the exact IAM cleanup policy and host-release target. The release retry end was extended to **October 19 at 04:53 UTC** to cover a recovered host's minimum allocation; the instance shutdown deadline remains **October 17 at 04:55 UTC**.

At October 17, 01:17 UTC, AWS accepted a boot-volume replacement task using the older AWS macOS 15.7.9 ARM image `ami-0faaf322c2ee142fd`. Because `ReplaceRootVolume` preserves the original launch template's throttled EBS parameters (`3000 IOPS`, `125 MiB/s`, encrypted hydration) and `UserData`, the instance remained impaired (`NetworkIn = 0`, `NetworkOut = 0`) and was terminated on schedule at **October 17 at 04:56:13 UTC**. Following post-termination scrubbing, dedicated host `h-07fdfc2fc8459d6ed` returned to `available` (`AvailableCapacity: 1`).

Launch template `lt-0dfea0dc2511baa41` (version 4) has been updated to match the proven October 13 configuration (`ami-0faaf322c2ee142fd`, 150 GiB `gp3`, `5000 IOPS`, `500 MiB/s` throughput, unencrypted direct snapshot hydration, and no boot-time `UserData`). At **October 17, 07:16 UTC**, an automated AWS Account Verification hold (`Client.Blocked` on `ec2:RunInstances` and `Operation not allowed` on `bedrock-runtime:Converse`) was placed on the AWS account after an older access key was used externally; that key and all unauthorized IAM/EC2 resources were deleted, and a background supervisor is armed to launch the clean simulator run as soon as AWS Support lifts the hold. Worker status is retained in `artifacts/simulator-worker-status.json`, with session resources in `artifacts/simulator-session-20261016.json`.

## Previous-session cleanup verified October 16

AWS `DescribeHosts` reports the previous dedicated host `h-08c439aae64c3ece5` as **released**. Neither previous disposable simulator instance appears in `DescribeInstances` for its exact ID. The provisioning details below are historical; the authorized replacement session is described above.

- Instance: `i-08103b0ca22704b64`, `m7i.xlarge` (4 vCPU, 16 GiB RAM).
- Ubuntu 24.04; nested virtualization explicitly enabled.
- 80 GiB encrypted gp3 root volume, deleted on termination.
- Security group has no inbound rules. Administration uses Systems Manager.
- No Elastic IP, NAT gateway, GPU, or paid bare-metal host.
- EventBridge Scheduler `hearth-vega-expire-20261112` terminates this exact instance at **2026-10-15 10:00 UTC**, retries failures for up to 24 hours, and deletes the schedule after completion. Its historical name does not reflect the revised deadline.
- Expiry role can terminate only this instance. Host role grants SSM managed-node access, not application AWS credentials.

Public on-demand compute price checked with AWS Price List API: $0.2016/hour, or $145.152 for 30 days continuously running. Storage, public IPv4, data transfer, and application model usage are additional. Credits and taxes are not included; this is not a hard spending cap.

Use AWS Console → Systems Manager → Session Manager to connect to the instance. Remote desktop ports must remain private; use Session Manager port forwarding rather than exposing VNC publicly.

The existing Hearth backend stays on its original host. This machine is disposable simulator infrastructure, not a migration of companion memories or credentials.

Provisioning is not proof of app execution. Record official simulator evidence only after Hearth visibly renders and remote navigation and audio are verified.

## Verified result

KVM acceleration is available and SDK 0.24.12112 successfully boots its official x86_64 virtual device. Hearth package download passed SHA-256 verification. Installation fails with `Module dependency not found` for `/com.amazon.kepler.webview_4@IWebview_4`. The WebView npm package advertises `sim_tv_aarch64`, not this simulator architecture. No Hearth-rendering evidence is available yet.

A persistent systemd expiry timer also shuts down the host at the same expiry time as a local fallback. Instance-initiated shutdown is configured to terminate, not stop. Administrative EC2 StopInstances calls can still stop it for cost savings without deleting the SDK.

To remove early, terminate the instance in EC2 and delete its expiry schedule. After termination, the `HearthVegaDemoHost` instance profile/role, `HearthVegaDemoExpiry` role, and `hearth-vega-demo` security group can be deleted; these configuration resources do not themselves incur hourly compute/storage charges.

## ARM Mac simulator host

Allocated October 13 after M1/M2 capacity was unavailable in the tested zones.

- Dedicated host `h-08c439aae64c3ece5`, `mac-m4.metal`, `us-east-1a`.
- Instance `i-04e3378de3696966c`; macOS Sequoia 15.8, 24 GiB RAM, 150 GiB encrypted gp3 EBS with delete-on-termination.
- Same no-inbound security group and SSM-only instance profile; no application credentials are copied.
- AWS Price List rate: **$1.23/host-hour**, minimum allocation **24 hours ($29.52)**. Thirty days continuously allocated costs **$885.60** for the host alone. EBS, public IPv4, data transfer, and taxes are additional; credit eligibility is not verified.
- **Stopping or terminating the Mac instance does not stop dedicated-host billing. Release the dedicated host too**, after the minimum allocation and scrub workflow permit it.
- `hearth-arm-vega-terminate-20261112` terminates the instance on **October 15 at 10:00 UTC**, about 36 hours after allocation. Its historical name is unchanged. The user requires a maximum 72-hour lifetime; never extend or launch replacement infrastructure without an explicit bounded expiry.
- `hearth-arm-vega-release-host` requests release every 15 minutes starting October 15 at 10:15 UTC through October 22, allowing the host scrub to finish. ReleaseHosts can report failures in its response rather than throwing, so repeated independent requests are intentional. These retries do not authorize continued simulator runtime. Verify the host reaches `released`; scheduled cleanup is not an absolute guarantee against permission changes or prolonged service failure. The earlier termination leaves about 36 hours for cleanup before the user's 72-hour deadline of October 16 at 22:09 UTC.
- The expiry role is restricted to this exact instance and host.

The ARM Hearth package builds, passes VPT validation, installs, and visibly renders on the official ARM simulator. Authenticated simulator-console framebuffer captures and remote-selected dialogue are verified in `docs/official-simulator.md`. The remote OK event is `kpenter`; the native wrapper maps it explicitly. Phone pairing and Sonic audio on this simulator remain unverified. Prefer releasing early once complete demo evidence has been captured; the bounded expiry is a safety deadline, not a recommendation to keep it allocated.
