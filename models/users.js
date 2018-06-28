/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('users', {
    id: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    login: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    emoji: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fid: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      defaultValue: '0'
    },
    invites: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    imgur: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    color: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '#FF0000'
    },
    power: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      defaultValue: '0'
    },
    mine: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      defaultValue: '0'
    },
	totalsp: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      defaultValue: '0'
	},
    time: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: '0'
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    pass: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    email: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    session: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    confirm: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'users'
  });
};
