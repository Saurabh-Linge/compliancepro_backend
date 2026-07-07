import { DatabaseService } from '../../core/database/database.service';

export async function syncAssessmentScoring(db: DatabaseService, assessmentId: number): Promise<void> {
  // 1. Fetch assessment details
  const assessmentResult = await db.query(
    `SELECT 
       asm.id,
       asm.year_id,
       asm.audit_type_id,
       asm.audit_unit_id,
       asm.assesment_period_from,
       asm.assesment_period_to,
       asm.audit_status_id,
       asm.audit_start_date,
       asm.audit_end_date,
       asm.updated_at,
       ym.year
     FROM audit_assesment_master asm
     LEFT JOIN year_master ym ON ym.id = asm.year_id
     WHERE asm.id = $1 AND asm.deleted_at IS NULL`,
    [assessmentId]
  );

  const assessment = assessmentResult.rows[0];
  if (!assessment) return;

  // Sync only for completed/compliance statuses (> 3)
  const statusId = Number(assessment.audit_status_id || 0);
  if (statusId <= 3) {
    // Soft delete/update existing scoring mapping if status is reverted/inactive
    await db.query(
      `UPDATE report_scoring_master 
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE assesment_id = $1`,
      [assessmentId]
    );
    // Clear the rating on assessment master
    await db.query(
      `UPDATE audit_assesment_master
       SET risk_rating_id = NULL, risk_rating = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [assessmentId]
    );
    // Recalculate other assessments' ratings since year total changed
    await updateAllAssessmentRatingsForYear(db, assessment.year_id);
    return;
  }

  // 2. Fetch Risk Categories and weights
  const riskCategoriesResult = await db.query(
    `SELECT
       rcm.id,
       rcm.risk_category AS title,
       COALESCE(rcw.risk_weight, 0)::float AS risk_weight
     FROM risk_category_master rcm
     LEFT JOIN risk_category_weights rcw
       ON rcw.risk_category_id = rcm.id
       AND rcw.year_id = $1
       AND rcw.is_active = 1
       AND rcw.deleted_at IS NULL
     WHERE rcm.is_active = 1
       AND rcm.deleted_at IS NULL
     ORDER BY rcm.id ASC`,
    [assessment.year_id]
  );
  const riskCategories = riskCategoriesResult.rows;

  // 3. Fetch Risk Matrix
  const riskMatrixResult = await db.query(
    `SELECT risk_parameter, business_risk_score::float, control_risk_score::float 
     FROM risk_matrix 
     WHERE year_id = $1 AND deleted_at IS NULL`,
    [assessment.year_id]
  );
  const businessRiskScores = new Map<number, number>();
  const controlRiskScores = new Map<number, number>();
  riskMatrixResult.rows.forEach(m => {
    const p = Number(m.risk_parameter);
    businessRiskScores.set(p, Number(m.business_risk_score || 0));
    controlRiskScores.set(p, Number(m.control_risk_score || 0));
  });

  const getMatrixScore = (br: any, cr: any): number => {
    const bRisk = Number(br);
    const cRisk = Number(cr);
    if (!bRisk || !cRisk || bRisk < 1 || bRisk > 4 || cRisk < 1 || cRisk > 4) {
      return 0;
    }
    return (businessRiskScores.get(bRisk) || 0) + (controlRiskScores.get(cRisk) || 0);
  };

  // 4. Fetch samplings
  const depositsCountResult = await db.query(
    `SELECT COUNT(*)::int AS count FROM dump_deposits WHERE sampling_filter = 1 AND assesment_period_id = $1 AND deleted_at IS NULL`,
    [assessmentId]
  );
  const depositsCount = depositsCountResult.rows[0]?.count || 0;

  const advancesCountResult = await db.query(
    `SELECT COUNT(*)::int AS count FROM dump_advances WHERE sampling_filter = 1 AND assesment_period_id = $1 AND deleted_at IS NULL`,
    [assessmentId]
  );
  const advancesCount = advancesCountResult.rows[0]?.count || 0;

  // 5. Fetch Answers and Annexures
  const answersResult = await db.query(
    `SELECT
       ans.id,
       ans.category_id,
       ans.dump_id,
       ans.business_risk,
       ans.control_risk,
       ans.question_id,
       ans.is_compliance,
       ans.assesment_id,
       ans.answer_given,
       qm.risk_category_id,
       qm.option_id,
       qm.area_of_audit_id AS audit_area_id,
       cm.linked_table_id
     FROM answers_data ans
     INNER JOIN question_master qm ON ans.question_id = qm.id
     LEFT JOIN category_master cm ON cm.id = ans.category_id
     WHERE ans.assesment_id = $1
       AND (ans.business_risk IN ('1', '2', '3') OR ans.control_risk IN ('1', '2', '3') OR qm.option_id = 4)
       AND ans.deleted_at IS NULL
       AND qm.deleted_at IS NULL`,
    [assessmentId]
  );
  const answers = answersResult.rows;

  const annexureAnswerIds = answers
    .filter((ans: any) => Number(ans.option_id) === 4)
    .map((ans: any) => Number(ans.id));

  let annexures: any[] = [];
  if (annexureAnswerIds.length) {
    const annexuresResult = await db.query(
      `SELECT
         ax.id,
         ax.answer_id,
         ax.business_risk,
         ax.control_risk,
         ax.risk_cat_id AS risk_category_id,
         ax.audit_commpliance AS is_compliance,
         ax.assesment_id,
         ans.category_id,
         ans.dump_id,
         ans.question_id,
         ans.answer_given,
         qm.option_id,
         qm.area_of_audit_id AS audit_area_id,
         cm.linked_table_id
       FROM answers_data_annexure ax
       INNER JOIN answers_data ans ON ax.answer_id = ans.id
       INNER JOIN question_master qm ON ans.question_id = qm.id
       LEFT JOIN category_master cm ON cm.id = ans.category_id
       WHERE qm.option_id = 4
         AND ax.answer_id = ANY($1::int[])
         AND ax.assesment_id = $2
         AND (ax.business_risk IN ('1', '2', '3') OR ax.control_risk IN ('1', '2', '3'))
         AND ax.deleted_at IS NULL`,
      [annexureAnswerIds, assessmentId]
    );
    annexures = annexuresResult.rows;
  }

  // 6. Perform aggregations
  const statsMap = new Map<string, Map<number, Map<number, { qualScoreSum: number; quanScoreSum: number; totalAnnexRows: number }>>>();

  const getStats = (catKey: string, broaderAreaId: number, riskCatId: number) => {
    if (!statsMap.has(catKey)) statsMap.set(catKey, new Map());
    const areaMap = statsMap.get(catKey)!;
    if (!areaMap.has(broaderAreaId)) areaMap.set(broaderAreaId, new Map());
    const riskMap = areaMap.get(broaderAreaId)!;
    if (!riskMap.has(riskCatId)) {
      riskMap.set(riskCatId, { qualScoreSum: 0, quanScoreSum: 0, totalAnnexRows: 0 });
    }
    return riskMap.get(riskCatId)!;
  };

  const getCategoryKey = (row: any) => {
    const linkedTableId = Number(row.linked_table_id || 0);
    if (linkedTableId === 1) return 'deposits';
    if (linkedTableId === 2) return 'advances';
    return 'general';
  };

  // Calculate scores per Risk Category
  const riskDataMap: Record<number, { wg_sc: number; avg_sc: number; '1': number; '2': number; '3': number; '4': number }> = {};
  riskCategories.forEach(rc => {
    riskDataMap[Number(rc.id)] = { wg_sc: 0, avg_sc: 0, '1': 0, '2': 0, '3': 0, '4': 0 };
  });

  for (const ans of answers) {
    const catKey = getCategoryKey(ans);
    const broaderAreaId = Number(ans.audit_area_id);
    const riskCatId = Number(ans.risk_category_id);
    if (!broaderAreaId || !riskCatId) continue;

    const stats = getStats(catKey, broaderAreaId, riskCatId);
    const score = getMatrixScore(ans.business_risk, ans.control_risk);

    if (catKey === 'general') {
      if (Number(ans.option_id) !== 4) {
        stats.qualScoreSum += score;
      }
    } else {
      stats.quanScoreSum += score;
    }

    if (Number(ans.option_id) !== 4) {
      const br = Number(ans.business_risk || 0);
      if (br >= 1 && br <= 4 && riskDataMap[riskCatId]) {
        const key = String(br) as '1' | '2' | '3' | '4';
        riskDataMap[riskCatId][key]++;
      }
    }
  }

  for (const ann of annexures) {
    const catKey = getCategoryKey(ann);
    const broaderAreaId = Number(ann.audit_area_id);
    const riskCatId = Number(ann.risk_category_id);
    if (!broaderAreaId || !riskCatId) continue;

    const stats = getStats(catKey, broaderAreaId, riskCatId);
    const score = getMatrixScore(ann.business_risk, ann.control_risk);

    stats.quanScoreSum += score;
    stats.totalAnnexRows++;

    const br = Number(ann.business_risk || 0);
    if (br >= 1 && br <= 4 && riskDataMap[riskCatId]) {
      const key = String(br) as '1' | '2' | '3' | '4';
      riskDataMap[riskCatId][key]++;
    }
  }

  const categoriesList = ['general', 'deposits', 'advances'];
  const broaderAreaIds = new Set<number>();
  for (const [_, areaMap] of statsMap) {
    for (const [areaId, _] of areaMap) {
      broaderAreaIds.add(areaId);
    }
  }

  let totalWeightedScore = 0;

  for (const catKey of categoriesList) {
    const areaMap = statsMap.get(catKey);
    if (!areaMap) continue;

    for (const broaderAreaId of broaderAreaIds) {
      const riskMap = areaMap.get(broaderAreaId);
      if (!riskMap) continue;

      for (const rc of riskCategories) {
        const riskCatId = Number(rc.id);
        const riskWeight = Number(rc.risk_weight || 0);
        const stats = riskMap.get(riskCatId);
        if (!stats) continue;

        if (stats.qualScoreSum === 0 && stats.quanScoreSum === 0) continue;

        let no_of_acc_checked = 0;
        if (catKey === 'advances') {
          no_of_acc_checked = advancesCount + stats.totalAnnexRows;
        } else if (catKey === 'deposits') {
          no_of_acc_checked = depositsCount + stats.totalAnnexRows;
        } else {
          no_of_acc_checked = stats.totalAnnexRows;
        }

        const avg_quan_score = stats.quanScoreSum > 0 ? stats.quanScoreSum / (no_of_acc_checked || 1) : 0;
        const tot_avg_score = stats.qualScoreSum + avg_quan_score;
        const avg_tot_score_per_audit = tot_avg_score; // 1 assessment
        const weighted_score = riskWeight * avg_tot_score_per_audit;

        if (riskDataMap[riskCatId]) {
          riskDataMap[riskCatId].wg_sc += Number(weighted_score.toFixed(2));
          riskDataMap[riskCatId].avg_sc += Number(tot_avg_score.toFixed(2));
        }
        totalWeightedScore += weighted_score;
      }
    }
  }

  // 7. Save into report_scoring_master
  const finalWeightedScore = totalWeightedScore.toFixed(2);

  // Check if assessment already has scoring master entry
  const existingRes = await db.query(
    `SELECT id FROM report_scoring_master WHERE assesment_id = $1 AND deleted_at IS NULL`,
    [assessmentId]
  );

  const riskDataJson = JSON.stringify(riskDataMap);
  const formattedPeriodFrom = assessment.assesment_period_from ? assessment.assesment_period_from.toISOString().split('T')[0] : null;
  const formattedPeriodTo = assessment.assesment_period_to ? assessment.assesment_period_to.toISOString().split('T')[0] : null;
  const formattedStartDate = assessment.audit_start_date ? assessment.audit_start_date.toISOString().split('T')[0] : null;
  const formattedEndDate = assessment.audit_end_date ? assessment.audit_end_date.toISOString().split('T')[0] : null;

  if (existingRes.rows.length > 0) {
    // Update existing row
    await db.query(
      `UPDATE report_scoring_master
       SET
         year = $1,
         audit_type_id = $2,
         audit_unit_id = $3,
         assesment_period_from = $4,
         assesment_period_to = $5,
         audit_status_id = $6,
         audit_start_date = $7,
         audit_end_date = $8,
         risk_data = $9,
         weighted_score = $10,
         advances_sampling = $11,
         deposits_sampling = $12,
         deleted_at = NULL,
         last_updated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE assesment_id = $13`,
      [
        assessment.year,
        assessment.audit_type_id,
        assessment.audit_unit_id,
        formattedPeriodFrom,
        formattedPeriodTo,
        statusId,
        formattedStartDate,
        formattedEndDate,
        riskDataJson,
        finalWeightedScore,
        advancesCount.toString(),
        depositsCount.toString(),
        assessmentId,
      ]
    );
  } else {
    // Insert new row
    await db.query(
      `INSERT INTO report_scoring_master (
         id, year, assesment_id, audit_type_id, audit_unit_id,
         assesment_period_from, assesment_period_to, audit_status_id,
         audit_start_date, audit_end_date, risk_data, weighted_score,
         advances_sampling, deposits_sampling, last_updated_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        assessmentId,
        assessment.year,
        assessmentId,
        assessment.audit_type_id,
        assessment.audit_unit_id,
        formattedPeriodFrom,
        formattedPeriodTo,
        statusId,
        formattedStartDate,
        formattedEndDate,
        riskDataJson,
        finalWeightedScore,
        advancesCount.toString(),
        depositsCount.toString(),
      ]
    );
  }

  // Recalculate all assessment ratings for the year
  await updateAllAssessmentRatingsForYear(db, assessment.year_id);
}

async function updateAllAssessmentRatingsForYear(db: DatabaseService, yearId: number): Promise<void> {
  // 1. Fetch completed assessments with weighted scores for the year
  const assessmentsRes = await db.query(
    `SELECT asm.id, asm.audit_unit_id, rsm.weighted_score
     FROM audit_assesment_master asm
     INNER JOIN report_scoring_master rsm ON rsm.assesment_id = asm.id
     WHERE asm.year_id = $1 AND asm.deleted_at IS NULL AND rsm.deleted_at IS NULL`,
    [yearId]
  );
  const assessments = assessmentsRes.rows;
  if (!assessments.length) return;

  // 2. Fetch risk_branch_rating range limits for the year
  const ratingsRes = await db.query(
    `SELECT audit_unit_id, risk_type_id, range_from, range_to
     FROM risk_branch_rating
     WHERE year_id = $1 AND deleted_at IS NULL`,
    [yearId]
  );
  const ratings = ratingsRes.rows;

  // Group ratings by unitId
  const ratingsMap = new Map<number, any[]>();
  ratings.forEach(r => {
    const uId = Number(r.audit_unit_id);
    if (!ratingsMap.has(uId)) ratingsMap.set(uId, []);
    ratingsMap.get(uId)!.push(r);
  });

  // Calculate yearTotal
  let yearTotal = 0;
  assessments.forEach(a => {
    yearTotal += Number(a.weighted_score || 0);
  });

  const getMatchedRating = (score: number, unitId: number): number => {
    const unitRatings = ratingsMap.get(unitId) || [];
    for (const r of unitRatings) {
      const upperBound = Number(r.range_from || 0);
      const lowerBound = Number(r.range_to || 0);
      if (score <= upperBound && score > lowerBound) {
        return Number(r.risk_type_id);
      }
    }
    // Fallback defaults
    if (score >= 3.0) return 1; // High
    if (score >= 2.0) return 2; // Medium
    return 3; // Low
  };

  const labelsMap: Record<number, string> = { 1: 'HIGH', 2: 'MEDIUM', 3: 'LOW' };

  // Calculate ratings first, then persist all assessments in one query.
  const assessmentRatings = assessments.map(a => {
    const score = Number(a.weighted_score || 0);
    const percentShare = yearTotal > 0 ? (score / yearTotal) * 100 : 0;
    const ratingId = getMatchedRating(percentShare, Number(a.audit_unit_id));
    const ratingLabel = labelsMap[ratingId] || 'LOW';

    return {
      id: Number(a.id),
      rating_id: ratingId,
      rating_label: ratingLabel,
    };
  });

  await db.query(
    `UPDATE audit_assesment_master assessment
     SET
       risk_rating_id = ratings.rating_id,
       risk_rating = ratings.rating_label,
       updated_at = CURRENT_TIMESTAMP
     FROM jsonb_to_recordset($1::jsonb) AS ratings(
       id bigint,
       rating_id bigint,
       rating_label text
     )
     WHERE assessment.id = ratings.id
       AND (
         assessment.risk_rating_id IS DISTINCT FROM ratings.rating_id
         OR assessment.risk_rating IS DISTINCT FROM ratings.rating_label
       )`,
    [JSON.stringify(assessmentRatings)]
  );
}
