import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface MakerAppSyncResolversConstructProps {
  api: appsync.IGraphqlApi;
  getMakerProfileLambda?: lambda.IFunction;
  setupMakerProfileLambda?: lambda.IFunction;
  updateMakerProfileLambda?: lambda.IFunction;
  updateSkillsLambda?: lambda.IFunction;
  getVerificationStatusLambda?: lambda.IFunction;
  getMakerSettingsLambda?: lambda.IFunction;
  updateMakerSettingsLambda?: lambda.IFunction;
  operationsLambda?: lambda.IFunction;
  craftHeritageLambda?: lambda.IFunction;
}

export class MakerAppSyncResolversConstruct extends Construct {
  constructor(scope: Construct, id: string, props: MakerAppSyncResolversConstructProps) {
    super(scope, id);

    // Query Resolvers
    if (props.getMakerProfileLambda) {
      const getMakerProfileDataSource = props.api.addLambdaDataSource(
        'GetMakerProfileDataSource',
        props.getMakerProfileLambda
      );

      getMakerProfileDataSource.createResolver('GetMakerProfileResolver', {
        typeName: 'Query',
        fieldName: 'getMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      // Public profile resolver (now user pool auth)
      getMakerProfileDataSource.createResolver('GetPublicMakerProfileResolver', {
        typeName: 'Query',
        fieldName: 'getPublicMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getVerificationStatusLambda) {
      const getVerificationStatusDataSource = props.api.addLambdaDataSource(
        'GetVerificationStatusDataSource',
        props.getVerificationStatusLambda
      );

      getVerificationStatusDataSource.createResolver('GetVerificationStatusResolver', {
        typeName: 'Query',
        fieldName: 'getVerificationStatus',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getMakerSettingsLambda) {
      const getMakerSettingsDataSource = props.api.addLambdaDataSource(
        'GetMakerSettingsDataSource',
        props.getMakerSettingsLambda
      );

      getMakerSettingsDataSource.createResolver('GetMakerSettingsResolver', {
        typeName: 'Query',
        fieldName: 'getMakerSettings',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.operationsLambda) {
      const operationsDataSource = props.api.addLambdaDataSource(
        'MakerOperationsDataSource',
        props.operationsLambda
      );

      operationsDataSource.createResolver('GetOperationsResolver', {
        typeName: 'Query',
        fieldName: 'getOperations',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      operationsDataSource.createResolver('GetCurrentOperationsResolver', {
        typeName: 'Query',
        fieldName: 'getCurrentOperations',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.craftHeritageLambda) {
      const craftHeritageDataSource = props.api.addLambdaDataSource(
        'CraftHeritageDataSource',
        props.craftHeritageLambda
      );

      craftHeritageDataSource.createResolver('ListCraftHeritageResolver', {
        typeName: 'Query',
        fieldName: 'listCraftHeritage',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      craftHeritageDataSource.createResolver('GetCraftHeritageResolver', {
        typeName: 'Query',
        fieldName: 'getCraftHeritage',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Mutation Resolvers
    if (props.setupMakerProfileLambda) {
      const setupMakerProfileDataSource = props.api.addLambdaDataSource(
        'SetupMakerProfileDataSource',
        props.setupMakerProfileLambda
      );

      setupMakerProfileDataSource.createResolver('SetupMakerProfileResolver', {
        typeName: 'Mutation',
        fieldName: 'setupMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateMakerProfileLambda) {
      const updateMakerProfileDataSource = props.api.addLambdaDataSource(
        'UpdateMakerProfileDataSource',
        props.updateMakerProfileLambda
      );

      updateMakerProfileDataSource.createResolver('UpdateMakerProfileResolver', {
        typeName: 'Mutation',
        fieldName: 'updateMakerProfile',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateSkillsLambda) {
      const updateSkillsDataSource = props.api.addLambdaDataSource(
        'UpdateSkillsDataSource',
        props.updateSkillsLambda
      );

      updateSkillsDataSource.createResolver('UpdateSkillsResolver', {
        typeName: 'Mutation',
        fieldName: 'updateSkills',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateMakerSettingsLambda) {
      const updateMakerSettingsDataSource = props.api.addLambdaDataSource(
        'UpdateMakerSettingsDataSource',
        props.updateMakerSettingsLambda
      );

      updateMakerSettingsDataSource.createResolver('UpdateMakerSettingsResolver', {
        typeName: 'Mutation',
        fieldName: 'updateMakerSettings',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.operationsLambda) {
      const operationsMutationDataSource = props.api.addLambdaDataSource(
        'MakerOperationsMutationDataSource',
        props.operationsLambda
      );

      operationsMutationDataSource.createResolver('SetupOperationsResolver', {
        typeName: 'Mutation',
        fieldName: 'setupOperations',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      operationsMutationDataSource.createResolver('UpdateOperationsResolver', {
        typeName: 'Mutation',
        fieldName: 'updateOperations',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      operationsMutationDataSource.createResolver('SetVacationModeResolver', {
        typeName: 'Mutation',
        fieldName: 'setVacationMode',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.craftHeritageLambda) {
      const craftHeritageMutationDataSource = props.api.addLambdaDataSource(
        'CraftHeritageMutationDataSource',
        props.craftHeritageLambda
      );

      craftHeritageMutationDataSource.createResolver('AddCraftHeritageResolver', {
        typeName: 'Mutation',
        fieldName: 'addCraftHeritage',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      craftHeritageMutationDataSource.createResolver('UpdateCraftHeritageResolver', {
        typeName: 'Mutation',
        fieldName: 'updateCraftHeritage',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });

      craftHeritageMutationDataSource.createResolver('DeleteCraftHeritageResolver', {
        typeName: 'Mutation',
        fieldName: 'deleteCraftHeritage',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }
  }
}
