# Viral loops, cold start, atomic networks and invite design for a "friends' free time overlaps" app (マジ暇)

Research notes, compiled 2026-11-20. Method: web search snippets (WebSearch). Note: direct page fetches to a16z.com, lennysnewsletter.com, techcrunch.com, sachinrekhi.com and grand-screen.com failed (hosts are blocked in this session's network), so several findings rely on search-result summaries or secondary sources, not full primary text. Claims sourced only from secondary or vendor pages are flagged.

## 1. What is an "atomic network", how big is it for a friend-scheduling app, and how did Partiful, Howbout, FreeHour, Zenly, BeReal, tbh/Gas handle the cold start?

### Takeaway
Chen defines the atomic network as the smallest network that is dense and stable enough to sustain itself. For a free-time-overlap app, that is one real friend group (one LINE group), not a school or a city. Every comparable app solved cold start by being very dense in one tight unit, such as one party, one high school or one campus. They also either let non-users get value through a link (Partiful) or launched a whole cohort at the same moment (tbh/Gas).

### Cited Findings
**Framework (Andrew Chen, *The Cold Start Problem*, 2021)**
- The atomic network is "the smallest network needed with enough density and stability to stand on its own". The first step in solving the cold start problem is to identify and build one. — [Medium summary (twosapp)](https://medium.com/twosapp/the-cold-start-problem-how-to-start-and-scale-network-effects-by-andrew-chen-813f0668c70f); [youexec](https://www.youexec.com/questions/what-is-an-atomic-network-according-to-chen)
- Messaging, email and video calling have "a deceptively small atomic network — in theory, just two people". In practice, the relevant atomic network is the social graph of a specific community. (secondary summary) — [Lenny's Newsletter "The Atomic Network" (excerpt, via search)](https://www.lennysnewsletter.com/p/atomic-network); [antoinebuteau.com summary](https://www.antoinebuteau.com/the-cold-start-problem-book-summary/)
- Uber's early atomic networks were not whole cities. The book gives "5pm at the Caltrain Station at 5th and King Street" as a more accurate unit. — [Lenny's Newsletter excerpt via search](https://www.lennysnewsletter.com/p/atomic-network)
- Every network has an easy side and a hard side. The hard side is the minority that does disproportionate work (creators, sellers), and it is hard to scale, so you should attract it first. — [Medium summary](https://medium.com/twosapp/the-cold-start-problem-how-to-start-and-scale-network-effects-by-andrew-chen-813f0668c70f); [andrewchen.com](https://andrewchen.com/solve-a-hard-problem-cold-start-problem/)
- The book has five stages: Cold Start, Tipping Point, Escape Velocity, Hitting the Ceiling, Moat. At the tipping point the atomic-network playbook gets repeated, and "each new network starts to tip faster and faster". — [Medium summary](https://medium.com/twosapp/the-cold-start-problem-how-to-start-and-scale-network-effects-by-andrew-chen-813f0668c70f); [youexec](https://youexec.com/book-summaries/the-cold-start-problem-by-andrew-chen)
- Critique: Business Insider called the book helpful on product decisions but thin on the structural question of when network effects actually last. — [Business Insider NL](https://www.businessinsider.nl/network-effects-have-taken-on-a-mystical-status-among-tech-investors-a-new-book-digs-into-how-they-work-but-fails-to-explain-when-they-can-be-expected-to-provide-lasting-value/)

**Partiful (2020s, US)**
- The invite is a shareable link that works as a lightweight landing page. Guests can RSVP and see who else is coming without downloading the app. Hosts share it in iMessage, Instagram and WhatsApp. — [Sacra](https://sacra.com/chat/h/ca6c792b-7d6d-42a9-ae5f-0970a819c66c/); [NoGood](https://nogood.io/blog/partiful-marketing-strategy/)
- The loop: each party brings in non-users, who then host their own parties and invite more people. Each event "seeds the next at almost no paid marketing cost". — [NoGood](https://nogood.io/blog/partiful-marketing-strategy/); [Sacra](https://sacra.com/c/partiful)
- Meme-ready invite templates made invites screenshot-worthy. In the celebrity look-alike contest wave, millions of people saw the Partiful link inside screenshots. — [NoGood](https://nogood.io/blog/partiful-marketing-strategy/)
- Hosts can reuse past guest lists, and Org Profiles serve fraternities and clubs, which is a campus/group-level atomic network. — [Sacra](https://sacra.com/chat/h/d75d313a-21c0-4696-ae31-3ccb39d25c1c/)
- About 500k MAU by Q1 2025 with roughly 400% YoY growth (third-party, Sacra; unverified). — [Sacra](https://sacra.com/research/partiful)

**Howbout (shared calendar for friends, UK/US)**
- Raised an $8M Series A from Goodwater in September 2024. — [TechCrunch 2024-09-13](https://techcrunch.com/2024/09/13/howbout-raises-8m-from-goodwater-to-build-a-calendar-that-you-can-share-with-your-friends)
- Events can be shared via a link that non-users can view, but responding requires downloading the app. That is a partial "value before install" design, gated at the moment of action. — TechCrunch as summarized in search results, [TechCrunch](https://techcrunch.com/?p=2850031)
- Claim that over 75% of Howbout's Gen Z users share their full calendar with at least one friend (secondary aggregator; not verified against TechCrunch). — [globalvillagespace](https://globalvillagespace.com/tech/howbout-the-social-scheduling-app-for-gen-z-to-connect-with-friends)
- No user counts or growth rates were found.

**FreeHour (Malta, university students, 2017–)**
- Students enter their timetable, choose which friends to share it with, and see their common free periods. Groups show the possible free slots for the whole group. Google Calendar import/sync is available. — [App Store](https://apps.apple.com/mt/app/freehour/id1200457873); [LovinMalta](https://lovinmalta.com/sponsored/this-maltese-app-is-a-must-have-for-all-freshers)
- It reached 19,000 downloads and more than 1.5M app opens by July 2018. Malta is a small, single-university-dominated market, which in effect made the country one atomic network (self-reported, partly sponsored coverage). — [LovinMalta](https://lovinmalta.com/lifestyle/technology/maltas-latest-student-app-is-topping-the-download-charts)

**Zenly (friends map, acquired by Snap 2017, shut down 2022–23)**
- 35M MAU by early 2022. Teens were the biggest users. It was used to find friends at school or concerts and meet up offline. — [TechCrunch 2022-04-22](https://techcrunch.com/2022/04/22/how-zenly-made-social-maps-cool-again-and-whats-next)
- Japan was a meaningful market: one Sensor Tower data point gives 8% of downloads from Japan, and TechCrunch called it "particularly popular in Japan". — [Mobile World Live](https://www.mobileworldlive.com/big-tech/snap-puts-zenly-tech-to-work-in-location-feature/)
- Cold-start tactics from a product analysis: friends you haven't added yet appear directly under your Zenly friends, and users can share their location with friends who are not on Zenly. — [SlideShare "How Zenly nailed it"](https://www.slideshare.net/MaximeBraud/how-zenly-nailed-it-product-analysis)

**BeReal (2022 breakout)**
- A paid college ambassador program had students host parties and give perks (e.g., free boba) to drive downloads. — [NPR 2022-04-16](https://www.npr.org/2022/04/16/1092814566/bereal-app-gen-z-download); [Rice Thresher](https://ricethresher.org/article/2022/02/to-bereal-or-not-to-bereal-students-discuss-the-trendy-social-media-app)
- Ambassadors were reportedly paid $30 per referral and $50 per download plus review. TechCrunch noted that some growth was "manufactured" to look viral. — [Brown Daily Herald](https://www.browndailyherald.com/article/2022/02/new-social-media-app-tells-students-to-bereal); [TechCrunch](https://techcrunch.com/2022/04/22/bereal-hype-or-hit-what-to-know-about-the-gen-z-photo-sharing-app-climbing-the-charts/amp)

**tbh (2017) / Gas (2022), Nikita Bier: school-by-school**
- Gas was launched in the same Georgia high school as tbh, on the same day, 5 years apart. The team collected interest first and then notified everyone at once to reach critical mass in the launch hour. — [learningbydesign Substack](https://learningbydesign.substack.com/p/gtm-zero-to-one-focus-100-on-testing); [Indie Hackers](https://www.indiehackers.com/post/nikita-bier-got-5m-users-in-2-months-with-a-0-marketing-budget-and-then-sold-his-business-to-facebook-for-30m-he-did-it-twice-b3e0cc1c68)
- Community playbook (unverified gist): a private Instagram account per school with a teaser bio ("You've been invited to the new RHS app"), following target students and waiting 24h for curious follow-requests. At 4:00 PM when school lets out ("Golden Launch Hour"), the App Store link is added and the account goes public. — [GitHub gist](https://gist.github.com/timlenardo/4c730f11ab1b69028f79221c2cb3771b)
- tbh released one state at a time to control growth. — [Wikipedia: Tbh](https://en.wikipedia.org/wiki/Tbh); [alexanderjarvis.com](https://www.alexanderjarvis.com/tbh-doing-things-that-dont-scale/)
- Gas said schools existed only "to make it easier to find and add your friends". — [The Hustle](https://thehustle.co/10-18-22-gas-app)
- Gas had about 7.4M installs and about $7M in consumer spend (Sensor Tower) and was acquired by Discord. tbh was acquired by Facebook in October 2017 and shut down in July 2018 for low usage. — [Wikipedia: Gas](https://en.wikipedia.org/wiki/Gas_(app)); [Wikipedia: Nikita Bier](https://en.wikipedia.org/wiki/Nikita_Bier)

### Inferences
- For マジ暇 the atomic network is one friend group of about 3–8 people who actually hang out (the people in one LINE group). The product only "works" when most of that group has entered availability. Density inside a group matters more than total users. An app with 10,000 scattered users but no complete groups has zero value.
- The "hard side" in a free-time app is the organizer friend, the one who says "who's free?" in the group chat. Target and reward organizers. They create the group and push the link, and the others are the easy side who only need to tap "free".
- Unit of rollout: group → class/circle (サークル) → school. Japanese university circles and high school classes map well to Partiful's org-profile and Gas's school-network pattern.
- Partiful is the closest analog. The group's shared link page (showing overlap) is the product's viral surface.

### Gaps
- No primary data on Howbout's or Partiful's actual invite conversion rates.
- Could not verify the book's exact sizes for Slack/Zoom atomic networks; full-text pages were inaccessible.
- No Japan-specific case study found for a friend-availability app (e.g., Japanese "暇" or "今から遊べる" apps).

## 2. Which invite mechanics have the highest documented conversion, and what are the anti-patterns?

### Takeaway
The best-documented high-performing pattern is a link that shows real value to the recipient without installing (Partiful), shared into the group chats people already use. Personalized deep links, a visible share button and an optimized message are the main levers. Forced invite gates (Howbout's reported "invite 3 friends", Lapse, Gas's lock-outs) can generate spikes, but they draw review backlash, and iOS 18 contact limits have weakened address-book loops.

### Cited Findings
- No-install link landing page: Partiful guests RSVP and see who is coming without downloading. — [Sacra](https://sacra.com/chat/h/ca6c792b-7d6d-42a9-ae5f-0970a819c66c/)
- Howbout lets non-users view an event link but requires a download to respond. — [TechCrunch via search](https://techcrunch.com/?p=2850031)
- Visibility: users won't invite if they can't find how. GetSocial data says the biggest improvements came from making the share button visible and fine-tuning the invite message. — [Unity blog](https://blog.unity.com/ja/games/how-to-get-the-most-out-of-friend-invites-in-your-app)
- Deep links can carry the referrer's details to personalize the new user's onboarding (e.g., "Taro invited you"). — [AppsFlyer](https://appsflyer.com/?p=19472)
- Invited users retain better: Google's App Invites case study reported users acquired through invites were 2x as likely to stay (Fabulous, 2016). — [Android Developers Blog](https://android-developers.googleblog.com/2016/01/how-fabulous-and-yummly-grew-with-app.html?m=1)
- tbh required address-book access before use, which made it easy to find and invite friends (secondary). It also used gems as rewards and capped answers at 12 polls per hour for scarcity. — [Indie Hackers](https://www.indiehackers.com/post/nikita-bier-got-5m-users-in-2-months-with-a-0-marketing-budget-and-then-sold-his-business-to-facebook-for-30m-he-did-it-twice-b3e0cc1c68)
- Bier: invite rates drop about 20% per year between ages 13 and 18 (podcast summary). — [Lenny's Podcast via recall.it summary](https://www.recall.it/summary/entrepreneurship/how-to-consistently-go-viral-nikita-biers-playbook-for-winning-at-consumer-apps)
- After the 2022 rebuild, Gas could no longer send invite SMS from a server via Twilio; regulation required messages to be sent from the user's phone. — [learningbydesign Substack](https://learningbydesign.substack.com/p/gtm-zero-to-one-focus-100-on-testing)
- **Anti-pattern, forced invites (Howbout):** Google Play reviews (mirrored on grand-screen.com) say users "can't even get into the app because they need to invite 3 friends", report being stuck on the "Invite your best friends" screen, and object that they only have one person to share with. These are user reports; there is no company statement. — [grand-screen.com reviews (search snippet)](https://grand-screen.com/apps/howbout-shared-calendar/reviews/)
- **Anti-pattern, forced invites (Lapse):** Lapse requires inviting friends to unlock features, and critics called it annoying. It also grew without marketing spend, so the gate "worked" for top-of-funnel growth. — [TechCrunch](https://techcrunch.com/?p=2605741)
- **Gas lock-out:** a secondary claim says users had to invite friends or be locked out for an hour. — [search summary of commentary](https://learningbydesign.substack.com/p/gtm-zero-to-one-focus-100-on-testing) (unverified)
- **BeReal paid referrals** ($30 per referral) drew authenticity criticism. — [Brown Daily Herald](https://www.browndailyherald.com/article/2022/02/new-social-media-app-tells-students-to-bereal)
- **iOS 18 contacts change (2024):** users can now grant Limited (selected contacts) access. Apple offers a Contact Access Button for adding contacts one by one. Bier called it "end of the world" for friend-based apps and said contact sharing dropped sharply for some startups. 9to5Mac argued granular control could increase willingness to grant access. — [TechCrunch 2024-06-12](https://techcrunch.com/2024/06/12/ios-18-cracks-down-on-apps-asking-for-full-address-book-access); [The Star 2024-10-03](https://www.thestar.com.my/tech/tech-news/2024/10/03/did-apple-just-kill-social-apps); [Apple Developer Forums](https://developer.apple.com/forums/thread/763786)
- **LINE mechanics:** `https://line.me/R/share?text={UTF-8 encoded text}` opens LINE's "Share with" picker with pre-filled text, including the URL. LIFF `shareTargetPicker()` lets a LIFF web app send a message (including Flex rich cards) to friends or groups the user picks. Current LIFF URLs are `https://liff.line.me/{liffId}` / `miniapp.line.me`. — [LINE Developers: URL scheme](https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme); [Classmethod (JP)](https://dev.classmethod.jp/articles/update-liff-sharetarget-picker/); [LINE LIFF](https://developers.line.biz/en/services/liff/)

### Inferences
- In Japan, the iMessage/SMS invite channel used by US apps maps to LINE groups. The highest-leverage invite is "create group → share one link into the existing LINE group" (one action reaches 5–10 people), not 1:1 SMS. Use `line.me/R/share` from iOS. A LIFF/web landing page can show a rich OGP preview (group name, inviter's name and "3 people are free on Saturday") inside LINE. Instagram DM/Story share is a secondary channel.
- The landing page should show value before install: the group's overlapping free slots, who has joined, and a no-install "mark my free times" web form (Partiful-style RSVP). App install is then the upgrade for notifications. This avoids Howbout's mistake of requiring a download to respond.
- Make invites optional but contextual: prompt at the moment of value ("Nobody in this group has filled in their times yet — send to LINE"), never as a hard gate. Given the backlash, avoid the Howbout 3-invite wall. Avoid paid referral rewards (BeReal criticism), and avoid server-sent spam SMS, which is also legally constrained.
- With iOS 18 limits, do not depend on full contact sync. Prefer the group link, plus an optional Contact Access Button / limited picker.

### Gaps
- No public, verified invite-acceptance rates for link vs SMS vs group-chat invites were found. Benchmarks need to come from our own analytics.
- No data found on LINE share-sheet conversion or OGP preview click-through in Japan.

## 3. How to measure: K-factor, viral cycle time, invite send rate, invite acceptance rate, activation definition

### Takeaway
K = invites sent per user × conversion rate per invite. Viral cycle time (the time from a user joining to their invitees joining) matters at least as much as K. Activation for a network app should be defined at the group level ("in a group with ≥N friends who saved availability"), because single-user metrics hide the cold-start problem.

### Cited Findings
- K-factor = invitations per user × conversion rate. Example: 10 invites × 20% acceptance = K of 2. The concept is attributed to David Skok's 2009 "Lessons Learned – Viral Marketing". — [Wikipedia: K-factor](https://en.wikipedia.org/wiki/K-factor_(marketing)); [First Round glossary](https://review.firstround.com/glossary/k-factor-virality/)
- In the classical viral model, growth is driven by K and cycle time, and "the impact of the cycle time is even stronger than that of the viral coefficient". — [ReadWrite](https://readwrite.com/virality-math-formula/)
- K of 0.5 with a 1-day cycle compounds faster than K of 0.9 with a 30-day cycle. Sustained K > 1 is rare and depends on retention. (aggregator) — [FourWeekMBA](https://fourweekmba.com/viral-coefficients-k-factor-the-mathematics-of-exponential-growth/)
- An academic operationalization: K = new users acquired virally in a period ÷ active users in that period. — [arXiv 1509.05025](https://arxiv.org/pdf/1509.05025)
- Bier's podcast emphasized onboarding and "identifying the right metrics" (summary only). — [Lenny's Podcast summary](https://www.recall.it/summary/entrepreneurship/how-to-consistently-go-viral-nikita-biers-playbook-for-winning-at-consumer-apps)

### Inferences
- Proposed metric tree for マジ暇:
  - Invite send rate = % of new users who share a group link within 24h.
  - Link open rate = opens ÷ shares (one LINE group share has many recipients, so track per share and per recipient).
  - Join rate = joins (web or app) ÷ unique openers.
  - K (weekly) = new users from invites ÷ users who shared.
  - Cycle time = median hours from inviter signup to invitee signup. Target under 24h, since free time is time-sensitive, which helps keep cycles short.
- Activation: "a member of ≥1 group with ≥3 members who have saved availability for this week" (a group-level aha). Also track group fill rate = members with availability ÷ group members, and "first overlap seen".
- Use group-level retention (groups with ≥3 active members in week 4) as the north-star proxy for atomic-network health.

### Gaps
- No published benchmark values (typical K, cycle time or activation thresholds) for friend-scheduling apps. Skok's original post could not be fetched to quote exact formula notation; the commonly cited approximation is U(t) ≈ U0·K^(t/ct) (from general knowledge, not a fetched source).

## 4. How to give value to a user whose friends haven't joined yet (single-player mode)

### Takeaway
"Come for the tool, stay for the network" (Chris Dixon, January 2015) is the canonical framework. A useful solo tool keeps the first user engaged while the network forms. For a free-time app, the most realistic solo value is a personal free-time planner (calendar import, "your free slots this week") plus a shareable "my free times" link that works for non-users.

### Cited Findings
- Dixon (Jan 2015): attract users with a single-player tool, then convert them into network participants. Delicious paired bookmark storage (tool) with shared tags (network). Instagram's early draw was filters, before its own network became the place to share. Dixon notes Facebook and Twitter started network-first, which is "very hard". (secondary) — [Rework: single-player mode](https://resources.rework.com/libraries/marketplace-growth/single-player-mode); [Commons pattern](https://commons-os.github.io/patterns/single-player-mode/)
- FreeHour's single-player value is a personal timetable with lecture reminders and calendar sync, and the network value is shared free periods. — [App Store](https://apps.apple.com/mt/app/freehour/id1200457873)
- Howbout lets you see your own schedule alongside friends' schedules (calendar as solo utility). — [TechCrunch via search](https://techcrunch.com/2024/09/13/howbout-raises-8m-from-goodwater-to-build-a-calendar-that-you-can-share-with-your-friends)
- Zenly shared location with non-Zenly friends, which gave value even when friends weren't on the app. — [SlideShare](https://www.slideshare.net/MaximeBraud/how-zenly-nailed-it-product-analysis)

### Inferences
- Solo features for マジ暇:
  1. Import the iOS calendar to auto-compute "your free time this week".
  2. A shareable "my free times" card/link (LINE/Instagram Story) that recipients can view and answer without the app. This is the solo action that is also the invite.
  3. Reminders like "Saturday afternoon is free — ask someone?"
- The solo features should naturally produce a shareable artifact (Partiful's screenshot effect), so single-player use feeds the loop instead of competing with it.

### Gaps
- No measured data on how single-player features affect retention or invite rates in social-scheduling apps.

## 5. Group-based onboarding, waitlists and scarcity, school-by-school rollout, empty states

### Takeaway
Onboard the group, not the individual. The first screen should be "make a group → share to your LINE group", and the link should land invitees directly in that group. Scarcity and timed cohort launches (tbh/Gas) build density but need an organized rollout per school. Empty states should show the invite path and pending members, not a blank screen.

### Cited Findings
- Gas and tbh gathered interest first and then released to a whole school at once (4 PM "golden hour") to reach critical mass instantly and climb App Store rankings. — [Indie Hackers](https://www.indiehackers.com/post/nikita-bier-got-5m-users-in-2-months-with-a-0-marketing-budget-and-then-sold-his-business-to-facebook-for-30m-he-did-it-twice-b3e0cc1c68); [GitHub gist](https://gist.github.com/timlenardo/4c730f11ab1b69028f79221c2cb3771b)
- It was "critical that you go high school by high school to build really strong atomic networks of users". — [learningbydesign Substack](https://learningbydesign.substack.com/p/gtm-zero-to-one-focus-100-on-testing)
- Partiful's org profiles and reusable guest lists support onboarding whole groups and clubs. — [Sacra](https://sacra.com/chat/h/d75d313a-21c0-4696-ae31-3ccb39d25c1c/)
- FreeHour groups compute shared free slots for the whole group. — [App Store](https://apps.apple.com/mt/app/freehour/id1200457873)
- Zenly made the network feel populated by listing not-yet-added friends right under existing friends. — [SlideShare](https://www.slideshare.net/MaximeBraud/how-zenly-nailed-it-product-analysis)
- BeReal's campus ambassadors used parties to seed campuses; the cost was authenticity criticism. — [NPR](https://www.npr.org/2022/04/16/1092814566/bereal-app-gen-z-download); [Brown Daily Herald](https://www.browndailyherald.com/article/2022/02/new-social-media-app-tells-students-to-bereal)

### Inferences
- Onboarding flow:
  1. Name the group (e.g., "ゼミの5人").
  2. Enter your own free times (30 seconds).
  3. "Send to LINE" (pre-filled message plus link, OGP card showing the group name and "〇〇さんが暇な時間を共有しました").
  4. Empty state: "Waiting for 4 more people", with each member's status and a resend button. Show partial overlap as soon as 2 people have joined.
- Treat the group link itself as the invite-only key. Scarcity comes naturally ("you can only join via a friend's group link"), and no separate waitlist is needed. A waitlist only makes sense for a coordinated school-launch day.
- School rollout in Japan: pick one university or a cluster of circles, recruit organizer types (サークル幹事) as the hard side, and launch to everyone at once on a timed day. Expand to adjacent schools once the first is dense. Avoid paid-per-download ambassadors.

### Gaps
- No documented data on waitlist or invite-only effects for friend-scheduling apps specifically.
- No Japanese case evidence (e.g., Japanese teen apps that launched school by school via LINE). This should be checked by the Japan-market researcher.
- Empty-state design best practices were not specifically researched (search budget); the recommendations above are inference.
