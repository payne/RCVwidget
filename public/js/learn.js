// <rcv-learn> — collapsible explainers at three reading levels plus references.
// Rendered into the light DOM so it uses the site's stylesheet.

const HTML = /* html */ `
<section class="learn" id="learn" aria-labelledby="learn-h">
  <h2 id="learn-h">How ranked-choice counting works</h2>
  <p class="muted">Pick the explanation that fits you. Each one opens and closes.</p>

  <details>
    <summary>Explain it like I'm 5 <small>Picking a class snack</small></summary>
    <div class="body">
      <p>Your class is choosing <strong>one</strong> snack. Instead of picking just one, everybody lines up
      the snacks from <em>most favorite</em> to <em>least favorite</em>.</p>
      <ol>
        <li>First we make piles: every kid's paper goes on the pile for their <strong>#1</strong> snack.</li>
        <li>If one pile has <strong>more than half</strong> of all the papers, that snack wins. Yay!</li>
        <li>If not, the <strong>smallest pile</strong> is out. Those kids don't lose their say. We look at their
          paper, find their <strong>next favorite</strong> snack, and move the paper to that pile.</li>
        <li>We keep doing that until one pile has more than half.</li>
      </ol>
      <p>So even if your favorite snack gets knocked out, your paper still helps choose between the snacks that are left.</p>
      <p><strong>Picking more than one?</strong> If the class is choosing <em>3</em> snacks, a snack only needs
      a big-enough pile, not half. When a snack has more papers than it needs, the extra bit of each paper
      slides over to that kid's next favorite. Nobody's paper is wasted.</p>
    </div>
  </details>

  <details>
    <summary>Explain it like I'm a teenager <small>Student council, no spoilers</small></summary>
    <div class="body">
      <p>In a normal "pick one" election, two similar candidates can split their supporters, and someone most people
      dislike can win with 35%. That's the <strong>spoiler effect</strong>. Ranked-choice voting (RCV) fixes a lot of that.</p>
      <h3>One seat: instant runoff</h3>
      <p>Everybody ranks the candidates. Round 1 counts first choices. If someone has a <strong>majority</strong>
      (more than half of the ballots still in play), they win. Otherwise the last-place candidate is eliminated and
      each of their ballots moves to that voter's next choice <em>that is still in the race</em>. Repeat.
      It's like holding a series of runoff elections without making everybody come back to vote again.</p>
      <p>A ballot is <strong>exhausted</strong> when every candidate it ranked is out. It still counted
      in earlier rounds; it just has nobody left to support. That's why the majority target can shrink a little
      from round to round.</p>
      <h3>Several seats: single transferable vote (STV)</h3>
      <p>With 3 seats, you don't need half. You need a <strong>quota</strong>: the smallest number of
      votes that only 3 people could ever reach at the same time. With 120 voters and 3 seats, that's 31.
      (4 people × 31 = 124, which is more than 120 voters, so a 4th person can't also get there.)</p>
      <p>When someone goes <em>over</em> the quota, the extra votes (the <strong>surplus</strong>) would be wasted, so
      they're passed on. To be fair, we don't pick <em>which</em> ballots to move. <em>Every</em> one of that winner's
      ballots moves to its next choice, but each counts as only a fraction of a vote. If Ava has 40 votes and needs 31,
      the surplus is 9, so each of Ava's 40 ballots carries 9/40 = 0.225 of a vote onward.</p>
      <p><strong>Tip:</strong> Ranking a backup can't hurt your first choice. Your ballot only moves on once
      your favorite has won or been knocked out.</p>
    </div>
  </details>

  <details>
    <summary>Explain it like I'm a college student <small>Quotas, transfers, and trade-offs</small></summary>
    <div class="body">
      <h3>Definitions</h3>
      <p>Let <em>V</em> be the number of valid ballots and <em>S</em> the number of seats. A candidate is
      <em>continuing</em> until elected or eliminated. A ballot's current preference is its highest-ranked continuing candidate.</p>
      <ul>
        <li><strong>IRV (S = 1).</strong> A candidate wins on reaching a strict majority of <em>continuing</em> ballots:
          <span class="formula">threshold = ⌊C / 2⌋ + 1</span>, where C is the number of non-exhausted ballots this round.</li>
        <li><strong>STV (S &gt; 1).</strong> This site uses the Droop quota, fixed at the first round:
          <span class="formula">q = ⌊V / (S + 1)⌋ + 1</span>. At most S candidates can reach q at once.</li>
      </ul>
      <h3>The algorithm used here</h3>
      <ol>
        <li>If the number of continuing candidates is no more than the seats left, elect them all.</li>
        <li>Elect every continuing candidate with votes ≥ quota (largest first, up to the seats left).</li>
        <li><strong>Surplus transfer (Gregory method).</strong> For a candidate elected with <em>v</em> votes, the surplus is
          <em>s = v − q</em>. Every ballot currently with that candidate continues at its weight multiplied by
          <span class="formula">s / v</span>. The candidate keeps exactly q. If several candidates are elected in the
          same round, their surpluses are transferred at the same time.</li>
        <li>If nobody reached the quota, eliminate the continuing candidate with the fewest votes. Their ballots transfer at
          full current weight.</li>
        <li><strong>Ties</strong> for elimination are broken backwards: the candidate with fewer votes in the most recent
          earlier round where they differed goes out. If they were tied in every round, a draw seeded by the election id
          decides, so recounts are reproducible.</li>
      </ol>
      <p>Weights are carried as real numbers and shown to two decimals. Real statutes such as Scottish STV
      truncate to five decimal places, and Meek or Warren STV also recompute keep-values for candidates already elected.
      Different rule sets can occasionally elect different people in close multi-seat races.</p>
      <h3>Properties and trade-offs</h3>
      <ul>
        <li><strong>Later-no-harm:</strong> satisfied. Adding lower preferences can't hurt a higher-ranked candidate.</li>
        <li><strong>Majority criterion:</strong> satisfied. A candidate ranked first by a majority wins.</li>
        <li><strong>Condorcet criterion:</strong> not guaranteed. A candidate who beats every rival one-on-one can be eliminated
          early for having too few first preferences. This is the "center squeeze."</li>
        <li><strong>Monotonicity:</strong> violated. In rare cases, ranking a candidate <em>higher</em> can make them lose,
          because it changes the order of elimination.</li>
        <li><strong>Proportionality (STV):</strong> any group of voters larger than k Droop quotas who all rank the same
          k candidates first will elect them. This is proportionality for solid coalitions.</li>
        <li><strong>Arrow's theorem</strong> says no ranked method with three or more options satisfies every fairness
          condition at once, so every system makes trade-offs.</li>
      </ul>
      <h3>About online polls like this one</h3>
      <p>This widget stops a browser from voting twice. It does not verify who you are. Treat results as an informal poll,
      not a secure election. Binding elections need voter authentication, a secret ballot, and an auditable record.</p>
    </div>
  </details>

  <details>
    <summary>References &amp; further reading <small>Sources</small></summary>
    <div class="body">
      <ul class="refs">
        <li><a href="https://en.wikipedia.org/wiki/Ranked_voting" target="_blank" rel="noopener">Ranked voting</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Instant-runoff_voting" target="_blank" rel="noopener">Instant-runoff voting</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Single_transferable_vote" target="_blank" rel="noopener">Single transferable vote</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Counting_single_transferable_votes" target="_blank" rel="noopener">Counting single transferable votes</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Droop_quota" target="_blank" rel="noopener">Droop quota</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Spoiler_effect" target="_blank" rel="noopener">Spoiler effect</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Monotonicity_criterion" target="_blank" rel="noopener">Monotonicity criterion</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Later-no-harm_criterion" target="_blank" rel="noopener">Later-no-harm criterion</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Condorcet_winner_criterion" target="_blank" rel="noopener">Condorcet winner criterion</a> (Wikipedia)</li>
        <li><a href="https://en.wikipedia.org/wiki/Arrow%27s_impossibility_theorem" target="_blank" rel="noopener">Arrow's impossibility theorem</a> (Wikipedia)</li>
        <li><a href="https://electowiki.org/wiki/Instant-runoff_voting" target="_blank" rel="noopener">Instant-runoff voting</a> (Electowiki)</li>
        <li><a href="https://electowiki.org/wiki/Single_transferable_vote" target="_blank" rel="noopener">Single transferable vote</a> (Electowiki)</li>
        <li><a href="https://fairvote.org/our-reforms/ranked-choice-voting/" target="_blank" rel="noopener">Ranked choice voting</a> (FairVote)</li>
        <li><a href="https://www.rcvresources.org/" target="_blank" rel="noopener">Ranked Choice Voting Resource Center</a></li>
        <li><a href="https://ballotpedia.org/Ranked-choice_voting_(RCV)" target="_blank" rel="noopener">Ranked-choice voting (RCV)</a> (Ballotpedia)</li>
        <li><a href="https://www.electoral-reform.org.uk/voting-systems/types-of-voting-system/single-transferable-vote/" target="_blank" rel="noopener">Single Transferable Vote</a> (Electoral Reform Society)</li>
      </ul>
    </div>
  </details>
</section>`;

class RcvLearn extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = '1';
    this.innerHTML = HTML;
    const open = this.getAttribute('open');
    if (open) {
      const idx = { eli5: 0, teen: 1, college: 2, refs: 3 }[open];
      if (idx != null) this.querySelectorAll('details')[idx].open = true;
    }
  }
}
customElements.define('rcv-learn', RcvLearn);
